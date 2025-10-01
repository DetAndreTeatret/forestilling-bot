import {
    AttachmentBuilder,
    ChatInputCommandInteraction, Guild,
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder,
    TextChannel, User
} from "discord.js"
import {needNotNullOrUndefined} from "../../util/util.js"
import {DatabaseUser, fetchAllUsers, fetchUser, updateUser} from "../../database/user.js"
import {DiscordMessageReplyLogger, Logger} from "../../util/logging.js"
import {getPersonnel} from "../../smartsuite/personnel.js"
import {scrapeUsers} from "schedgeup-scraper"

export const data = new SlashCommandBuilder()
    .setName("userstats")
    .setDescription("Some stats about users")
    .addSubcommand(
        new SlashCommandSubcommandBuilder()
            .setName("unlinked")
            .setDescription("Create a report of all Discord users not linked to any SchedgeUp user"))
    .addSubcommand(
        new SlashCommandSubcommandBuilder()
            .setName("info")
            .setDescription("Get all stored info about a given user. Can be either a Discord or a SchedgeUp user")
            .addUserOption(o => o.setName("discord-user").setDescription("Discord user"))
            .addStringOption(o => o.setName("schedgeup-id").setDescription("Schedgeup id")))
    .addSubcommand(
        new SlashCommandSubcommandBuilder()
            .setName("userlist")
            .setDescription("Create a report off all linked users")
    )
    .addSubcommand(
        new SlashCommandSubcommandBuilder()
            .setName("syncusers")
            .setDescription("Sync users without a linked SS record, if they have one. (internal)")
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    const subCommand = interaction.options.getSubcommand()
    const guild = needNotNullOrUndefined(interaction.guild, "userstats#guild")
    const channel = needNotNullOrUndefined(interaction.channel, "userstats#channel") as TextChannel
    const logger = new DiscordMessageReplyLogger(interaction)

    switch (subCommand) {
        case "unlinked": {
            await unlinkedUserStats(guild, logger)
            break
        }
        case "info": {
            const discordUser = interaction.options.getUser("discord-user")
            const schedgeUpId = interaction.options.getString("schedgeup-id")

            if (!discordUser && !schedgeUpId) {
                await logger.logWarning("You need to provide either a Discord user or a SchedgeUp id to see user info. \n" +
                    "Use /userstats userlist if you want a list of every linked user")
                break
            }

            await listUsers(channel, logger, discordUser, schedgeUpId)
            break
        }
        case "userlist": {
            await listUsers(channel, logger, null, null)
            break
        }
        case "syncusers": {
            await syncAndUpdateUserInfo(logger)
            break
        }
        default: {
            throw new Error("Illegal state in userStats")
        }
    }
}

async function unlinkedUserStats(guild: Guild, logger: Logger) {
    await logger.logLine("Generating unlinked user stats...")
    const members = Array.from((await guild.members.fetch()).values())
    const users = await fetchAllUsers()
    const unlinkedMembers = members.filter(m => users.find(u => u.discordSnowflake === m.id) === undefined && !m.user.bot)

    const discordRoles = Array.from((await guild.roles.fetch()).entries())
    let unlinkedMembersText = ""
    for await (const discordRole of discordRoles) {
        const membersWithRole = unlinkedMembers.filter(m => m.roles.highest.id === discordRole[0])
        if (membersWithRole.length === 0) continue
        unlinkedMembersText += "\n" + discordRole[1].name + ":\n" + membersWithRole.map(m => m.toString()).join(", ")
    }

    await logger.logLine("Discord users that are currently not linked to an user:")
    await logger.logLine(unlinkedMembersText)

}

async function listUsers(channel: TextChannel, logger: Logger, discordUser: User | null, schedgeUpId: string | null) {
    await logger.logLine("Fetching user info!")

    let user
    if (discordUser) {
        user = await fetchUser(undefined, discordUser.id)
        if (!user) {
            await logger.logLine("User " + discordUser.tag + " does not have a linked account :(")
            return
        }
    } else if (schedgeUpId) {
        user = await fetchUser(schedgeUpId, undefined)
        if (!user) {
            await logger.logLine("User " + schedgeUpId + " does not have a linked account :(")
            return
        }
    }

    if (user) {
        const discordMember = await channel.guild.members.fetch(user.discordSnowflake)
        await logger.logLine("UserID: " + user.userId + "\nSchedgeUpID: " + user.schedgeUpId + "\nDiscordDisplayName: " + discordMember.displayName + "\nSmartSuiteRecordID: " + (user.smartSuiteRecordID ?? "not linked yet"))
    } else {
        await logger.logLine("Creating user report...")
        const allUsers = await fetchAllUsers()
        let report = ""
        for await (const databaseUser of allUsers) {
            await logger.logPart("Adding user: " + databaseUser.userId + "/" + allUsers.length) // TODO store display name??
            const discordUser = await channel.guild.members.fetch(databaseUser.discordSnowflake)
            report += "\nUserID: " + databaseUser.userId + ", SchedgeUpID: " + databaseUser.schedgeUpId + ", DiscordUser: " + (discordUser === undefined ? databaseUser.discordSnowflake : discordUser.displayName) + " SmartSuiteRecordID: " + (databaseUser.smartSuiteRecordID ?? "not linked yet")
        }
        const attachmentBuilder = new AttachmentBuilder(Buffer.from(report))
        attachmentBuilder.setName("UserReport.txt")
        attachmentBuilder.setDescription("All linked users")

        await channel.send({files: [attachmentBuilder]})
    }

}

async function syncAndUpdateUserInfo(logger: Logger) {
    const users = await fetchAllUsers()
    const SUUsers = await scrapeUsers(users.map(u => u.schedgeUpId))
    const smartSuiteRecords = await getPersonnel()

    for (const user of users) {
        if (user.smartSuiteRecordID) continue
        // Bonus, check for existing record on SS
        const smartSuiteRecord = smartSuiteRecords.find(p => p.name.toLowerCase().trim() === SUUsers.find(u => u.userId === user.schedgeUpId)!.displayName)
        if (!smartSuiteRecord) continue

        // Update an existing user with new SmartSuite info
        await updateUser(new DatabaseUser(user.userId, user.schedgeUpId, user.discordSnowflake, smartSuiteRecord.recordID), user.schedgeUpId)
        await logger.logLine(`Added SmartSuite link to existing user\n(${smartSuiteRecord.name}/[${smartSuiteRecord.roles.join(",")}]/${smartSuiteRecord.recordID})`)
    }
}
