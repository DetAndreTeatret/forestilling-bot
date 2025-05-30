import {
    CategoryChannel,
    ChannelType,
    Collection,
    Guild,
    GuildMember, PermissionOverwrites,
    PermissionsBitField,
    Role,
    Snowflake,
    TextChannel
} from "discord.js"
import {selectEntry} from "../database/sqlite.js"
import {needSetting, updateSetting} from "../database/settings.js"
import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {Logger} from "../common/logging.js"
import {fetchShowDayBySU} from "../database/showday.js"
import {getDayNameNO} from "../common/date.js"
import {Event} from "schedgeup-scraper"
import {postCastList, postEventInfo} from "./embeds.js"
import {getLinkedDiscordUser, getLinkedSchedgeUpUser, getShowGuestsForChannel} from "../database/user.js"
import {checkPermission, PermissionLevel} from "./permission.js"

export const DISCORD_CHANNEL_TOPIC_FORMAT = "(Do not remove this) ID:%i"
export const EVENT_DISCORD_CHANNEL_ID_REGEX = new RegExp("^\\(Do not remove this\\) ID:\\d+R?$")
export const DAYTIME_DISCORD_CHANNEL_NAME_SUFFIX = "dagtid"

/**
 * Get all currently created channels that should be managed by this bot.
 * The values in the collection are the SchedgeUpIDs for the shows that use the given channel
 * @param guild The guild to search for running channels
 */
export async function mapRunningChannels(guild: Guild) {
    const channels = await guild.channels.fetch()
    const runningChannels: Collection<TextChannel, string[]> = new Collection<TextChannel, string[]>()

    for await (const channel of channels.values()) {
        if (channel == null || channel.type !== ChannelType.GuildText) continue

        const textChannel = channel as TextChannel
        if (textChannel.topic === null) continue

        if (EVENT_DISCORD_CHANNEL_ID_REGEX.test(textChannel.topic)) {
            const id = textChannel.topic.split(":")[1]
            const result = await fetchShowDayBySU(id, textChannel.name.includes(DAYTIME_DISCORD_CHANNEL_NAME_SUFFIX))
            if (result) {
                runningChannels.set(textChannel, result.schedgeUpIds)
            }
        }
    }

    return runningChannels
}

export async function getShowsCategory(guild: Guild) {
    const storedCategoryId = await selectEntry("Settings", "SettingKey=\"category_id\"", ["SettingValue"])

    let category: CategoryChannel
    if (storedCategoryId === undefined) {
        // No category yet, create one please
        const adminRoleSnowflake = await needSetting("admin_role_snowflake")
        category = await guild.channels.create({
            name: needEnvVariable(EnvironmentVariable.CHANNEL_CATEGORY_NAME),
            type: ChannelType.GuildCategory,
            permissionOverwrites: [{
                id: guild.roles.everyone,
                deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel]
            }, {
                id: guild.client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }, {
                id: adminRoleSnowflake,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }]
        })

        await updateSetting("category_id", category.id)
    } else {
        category = await guild.channels.fetch(storedCategoryId["SettingValue"]) as CategoryChannel
    }

    return category
}

/**
 *
 * @param guild the guild to create the channel in
 * @param event the event to use info from when initially creating the channel
 * @param dayTime Is this channel for daytime events? (barnelørdag osv...)
 * @param discordLogger the logger that's used in the update command to log to the discord channel
 */
export async function createNewChannelForEvent(guild: Guild, event: Event, dayTime: boolean, discordLogger: Logger) {
    const channel = await guild.channels.create({
        name: getDayNameNO(event.eventStartTime) + (dayTime ? "-" + DAYTIME_DISCORD_CHANNEL_NAME_SUFFIX : ""),
        type: ChannelType.GuildText,
        topic: DISCORD_CHANNEL_TOPIC_FORMAT.replace("%i", event.id),
        parent: (await getShowsCategory(guild)).id,
    })

    await postEventInfo(channel, event)
    await postCastList(channel, [event], dayTime)

    let allRoles: Role[] | undefined

    for await (const worker of event.workers) {
        const user = await getLinkedDiscordUser(worker, discordLogger)
        if (user) {
            let fetchedMember
            try {
                fetchedMember = await channel.guild.members.fetch(String(user)) // Why javascript :'(
            } catch (e) {
                const SUInfo = await getLinkedSchedgeUpUser(user, discordLogger)
                await discordLogger.logWarning("Got error when trying to fetch Discord user!\n Context: {discordID:" + user + ",SchedgeUpInfo:" + SUInfo + "}\n" + e)
                continue
            }
            await addMemberToChannel(channel, fetchedMember, discordLogger)
        } else if (user === null) {
            // ///////////////////////////////////////////////////////////////////////////////////////////////////
            // Secret function, if the guest name is equal to an existing role the role is added to the channel //
            // ///////////////////////////////////////////////////////////////////////////////////////////////////
            if (!allRoles) allRoles = Array.from((await guild.roles.fetch()).values())
            const roleMaybe = allRoles.find(r => r.name.toLowerCase() === worker.who.toLowerCase())
            if (roleMaybe) {
                await addRoleToChannel(channel, roleMaybe, discordLogger)
            } else await discordLogger.logPart("Skipped adding Guest user " + worker.who + " to Discord channel " + channel.name)
        }
    }

    return channel
}

/**
 * @param channel channel to update
 * @param events The current events to check against, this method will add users not found in current channel.
 * @param discordLogger the logger that's used in the update command to log to the discord channel
 *
 * @return returns all members added to this channel
 */
export async function updateMembersForChannel(channel: TextChannel, events: Event[], discordLogger: Logger) {
    await discordLogger.logLine("Updating members for channel " + channel.name + " (" + events.map(e => e.title) + ")")

    // We have to complete the role pass before the user pass, so we don't accidentally remove users twice
    const currentRolesFromDiscord: Role[] = []
    for await (const permissionEntry of channel.permissionOverwrites.cache.map((v, k): [Role | undefined, PermissionOverwrites] => [channel.guild.roles.cache.get(k), v])) {
        if (permissionEntry[0] && permissionEntry[1].allow.has(PermissionsBitField.Flags.ViewChannel)) {
            currentRolesFromDiscord.push(permissionEntry[0])
        }
    }

    const usersFromSchedgeUp: Snowflake[] = []
    let allRoles: Role[] | undefined
    const rolesInChannel: Role[] = []
    const rolesAdded: Role[] = []

    for (let i = 0; i < events.length; i++) {
        for await (const worker of events[i].workers) {
            const user = await getLinkedDiscordUser(worker, discordLogger)
            // User is null if Guest
            if (user === null) {
                // ///////////////////////////////////////////////////////////////////////////////////////////////////
                // Secret function, if the guest name is equal to an existing role the role is added to the channel //
                // ///////////////////////////////////////////////////////////////////////////////////////////////////

                // We don't need to do anything if the role already is in the channel
                const match = currentRolesFromDiscord.find(r => r.name.toLowerCase() === worker.who.toLowerCase())
                if (!match) {
                    if (!allRoles) allRoles = Array.from((await channel.guild.roles.fetch()).values())
                    const roleMaybe = allRoles.find(r => r.name.toLowerCase() === worker.who.toLowerCase())
                    if (roleMaybe) {
                        await addRoleToChannel(channel, roleMaybe, discordLogger)
                        rolesAdded.push(roleMaybe)
                        rolesInChannel.push(roleMaybe)
                    } else await discordLogger.logPart("Skipped adding Guest user " + worker.who + " to Discord channel " + channel.name)
                } else {
                    rolesInChannel.push(match)
                }
            } else if (user !== undefined && !usersFromSchedgeUp.includes(user)) {
                usersFromSchedgeUp.push(user)
            }
        }
    }

    const adminSnowflake = await needSetting("admin_role_snowflake")
    const rolesToRemove = currentRolesFromDiscord.filter(role => {
        return role.id !== adminSnowflake && !rolesInChannel.some(r => r.id === role.id)
    })

    for await (const role of rolesToRemove) {
        await removeRoleFromChannel(channel, role, discordLogger)
    }

    const usersFromDiscord: GuildMember[] = []
    for await (const member of channel.members.values()) {
        usersFromDiscord.push(member)
    }

    // Subtract users already in discord
    const usersToAdd = usersFromSchedgeUp.filter((value) => {
        return !usersFromDiscord.some(member => member.id === value)
    })

    const membersAdded: GuildMember[] = []
    for (let i = 0; i < usersToAdd.length; i++) {
        const user = usersToAdd[i]
        let fetchedMember
        try {
            fetchedMember = await channel.guild.members.fetch(String(user)) // Why javascript :'(
        } catch (e) {
            const SUInfo = await getLinkedSchedgeUpUser(user, discordLogger)
            await discordLogger.logWarning("Got error when trying to fetch Discord user!\n Context: {discordID:" + user + ",SchedgeUpInfo:" + SUInfo + "}\n" + e)
            continue
        }
        await addMemberToChannel(channel, fetchedMember, discordLogger)
        membersAdded.push(fetchedMember)
    }

    const guestUsersForChannel = await getShowGuestsForChannel(channel.id)

    const usersToRemove = usersFromDiscord.filter((value) => {
        return !usersFromSchedgeUp.includes(value.id) && // Don't remove if user is listed on SchedgeUp
            !guestUsersForChannel.includes(value.id) && // Don't remove if user is explicitly added as a guest
            !rolesInChannel.map(r => value.roles.cache.has(r.id)).includes(true) // Don't remove if user has any of the roles added to this channel
    })

    const membersRemoved: GuildMember[] = []
    for await (const member of usersToRemove) {
        if (await checkPermission(member, PermissionLevel.ADMINISTRATOR)) continue
        await discordLogger.logPart("Removing user " + member.displayName + " from channel")
        await removeMemberFromChannel(channel, member, discordLogger)
        membersRemoved.push(member)
    }

    return new ChannelMemberDifference(channel, membersAdded, membersRemoved, rolesAdded, rolesToRemove)
}

export async function addMemberToChannel(channel: TextChannel, member: GuildMember, discordLogger: Logger) {
    await discordLogger.logPart("Adding member " + member.displayName + " to channel " + channel.name)
    await channel.permissionOverwrites.edit(member, {SendMessages: true, ViewChannel: true})
}

export async function removeMemberFromChannel(channel: TextChannel, member: GuildMember, discordLogger: Logger) {
    await discordLogger.logPart("Removing member " + member.displayName + " from channel " + channel.name)
    await channel.permissionOverwrites.delete(member)
}

export async function addRoleToChannel(channel: TextChannel, role: Role, discordLogger: Logger) {
    await discordLogger.logPart("Adding role " + role.name + " to channel " + channel.name)
    await channel.permissionOverwrites.edit(role, {SendMessages: true, ViewChannel: true})
}

export async function removeRoleFromChannel(channel: TextChannel, role: Role, discordLogger: Logger) {
    await discordLogger.logPart("Removing role " + role.name + " from channel " + channel.name)
    await channel.permissionOverwrites.delete(role)
}

/**
 * Contains members added or removed from a channel during an update
 */
export class ChannelMemberDifference {
    channel: TextChannel
    membersAdded: GuildMember[]
    membersRemoved: GuildMember[]
    rolesAdded: Role[]
    rolesRemoved: Role[]

    constructor(channel: TextChannel, membersAdded: GuildMember[], membersRemoved: GuildMember[], rolesAdded: Role[], rolesRemoved: Role[]) {
        this.channel = channel
        this.membersAdded = membersAdded
        this.membersRemoved = membersRemoved
        this.rolesAdded = rolesAdded
        this.rolesRemoved = rolesRemoved
    }
}
