import {
    ChannelType,
    ChatInputCommandInteraction,
    Collection,
    Guild,
    SlashCommandBuilder,
    TextChannel
} from "discord.js"
import {getEventInfos, scrapeEvents, Event, DateRange} from "schedgeup-scraper"
import {
    ChannelMemberDifference,
    SuperClient,
    updateCastList,
    updateShowsInEventInfoMessage
} from "../discord.js"
import {afterDays, renderDateYYYYMMDD} from "../../common/date.js"
import {addGuildToUpdate, startDaemon} from "../daemon.js"
import {
    addEventToShowDay,
    createNewShowday,
    fetchShowDayByDate,
    fetchShowDayBySU,
    isDayTimeShow
} from "../../database/showday.js"
import {fetchSetting, updateSetting} from "../../database/settings.js"
import {DiscordMessageReplyLogger, Logger} from "../../common/logging.js"
import {needNotNullOrUndefined} from "../../common/util.js"


export const data = new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update show channels in Discord(delete/create/update")

export async function execute(interaction: ChatInputCommandInteraction) {
    const guild = needNotNullOrUndefined(interaction.guild, "guild")

    // First time stuff
    addGuildToUpdate(guild)
    const roleSnowflake = await fetchSetting("admin_role_snowflake")
    if (roleSnowflake === undefined) {
        console.info("Did not find admin role! Creating a new one...")
        const role = await guild.roles.create({
            name: "SchedgeUps Utvalgte",
            color: "Red",
            reason: "Admin role for SchedgeUpBot",
            mentionable: false,
            hoist: false
        })

        await updateSetting("admin_role_snowflake", role.id)
    }

    const logger = new DiscordMessageReplyLogger(interaction)
    await logger.logLine("Starting update!")
    try {
        const guild = needNotNullOrUndefined(interaction.guild, "guild")
        const memberDifference = await update(guild, logger)
        const channel = interaction.channel
        if (channel !== null && channel.type === ChannelType.GuildText) await channel.send(formatMemberDifference(memberDifference))
    } catch (error) {
        await logger.logWarning("Encountered error during update + " + error)
        throw error
    }

    startDaemon() // Only start daemon after first update to ensure local channelCache is updated
}

function formatMemberDifference(differences: ChannelMemberDifference[]) {
    let result = "Members added/removed during update:"

    differences.forEach(difference => {
        result += "\n\n#" + difference.channel.name

        if (difference.membersAdded.length !== 0) result += ", Added: " + difference.membersAdded.map(member => member.nickname !== null ? member.nickname : member.displayName).join(",")
        else result += ", No members added"

        if (difference.membersRemoved.length !== 0) result += ", Removed: " + difference.membersRemoved.map(member => member.nickname !== null ? member.nickname : member.displayName).join(",")
        else result += ", No members removed"
    })

    return result
}

/**
 * Look for changes in SchedgeUp
 * @return All members removed or added during the update
 */
export async function update(guild: Guild, logger: Logger) {
    await logger.logLine("Fetching SchedgeUp Events...")

    const today = new Date()
    // Shift the week such that Monday is day 0, and Sunday is day 6(We want new shows from Monday)
    const eventInfos = await getEventInfos(new DateRange(today, afterDays(6 - (today.getDay() === 0 ? 6 : today.getDay() - 1), today)), false)
    const events = await scrapeEvents(eventInfos)

    const client = guild.client as SuperClient

    await logger.logLine("Mapping currently running Discord channels...")
    const channels = await client.mapRunningChannels(guild)
    const channelsMapped = await mapChannelsToEvents(channels, events)

    const daysUpdated: TextChannel[] = []
    const channelMemberDifferences: ChannelMemberDifference[] = []

    // TODO decide if bot should keep any show related info stored, or rebuild everytime?
    for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const isEventDaytime = await isDayTimeShow(event.showTemplateId === undefined ? "null" : event.showTemplateId, event.title)
        const showDay = await fetchShowDayBySU(event.id, isEventDaytime)
        if (!showDay) {

            // No ShowDay for the given event found, maybe there is one for the given date?
            const showDay0 = await fetchShowDayByDate(event.eventStartTime, isEventDaytime)
            if (!showDay0) {

                // No ShowDay anywhere, create a new one
                await logger.logPart("Creating new ShowDay(" + event.title + "/" + renderDateYYYYMMDD(event.eventStartTime) + ")")
                const channel = await client.createNewChannelForEvent(guild, event, isEventDaytime, logger)
                channelMemberDifferences.push(new ChannelMemberDifference(channel, Array.from(channel.members.values()), []))
                await createNewShowday(channel.id, event.eventStartTime, isEventDaytime, event.id)
                channelsMapped.set(channel, [event])

            } else {

                // Found a ShowDay for the event date, merge into it
                await logger.logPart("Adding event(" + event.title + "/" + renderDateYYYYMMDD(event.eventStartTime) + ") to existing ShowDay")
                await addEventToShowDay(showDay0, event.id)
                const channel = channelsMapped.findKey((e, c) => c.id === showDay0.discordChannelSnowflake)
                if (!channel) {
                    throw new Error("Could not find channel belonging to ShowDay " + renderDateYYYYMMDD(showDay0.when))
                } else {
                    const events = channelsMapped.get(channel)
                    if (!events) throw new Error("Could not find any events mapped to channel " + channel)
                    events.push(event)

                    // Merge successful, now update channel with new members
                    channelMemberDifferences.push(await client.updateMembersForChannel(channel, events, logger))

                    // Update pinned info messages
                    await updateShowsInEventInfoMessage(channel, showDay0.when, events.map(e => e.title).join(", "))
                    await updateCastList(channel, events, showDay0.dayTimeShows)
                }

            }
        } else {

            // Update showday
            // TODO can be fetched with discord api instead probably
            const channel = channelsMapped.findKey((e, c) => c.id === showDay.discordChannelSnowflake)
            if (!channel) {
                throw new Error("Could not find channel belonging to ShowDay " + renderDateYYYYMMDD(showDay.when))
            } else {

                // Prevent updating showday channels multiple times for events on same days
                if (daysUpdated.includes(channel)) {
                    continue
                } else {
                    daysUpdated.push(channel)
                }

                // Update channel members
                await logger.logLine("Updating ShowDay for " + event.title + "/" + renderDateYYYYMMDD(event.eventStartTime))
                const events = channelsMapped.get(channel)
                if (!events) throw new Error("Could not find any events mapped to channel " + channel)

                // Update members in channel
                channelMemberDifferences.push(await client.updateMembersForChannel(channel, events, logger))

                // Update pinned info messages
                await updateShowsInEventInfoMessage(channel, showDay.when, events.map(e => e.title).join(", ")) // TODO Is a full rebuild every time necessary?
                await updateCastList(channel, events, showDay.dayTimeShows)

            }

        }
    }

    await logger.logLine("Update is done!")
    return channelMemberDifferences
}


async function mapChannelsToEvents(channels: Collection<TextChannel, string[]>, events: Event[]) {
    const channelsMapped: Collection<TextChannel, Event[]> = new Collection<TextChannel, Event[]>()
    for await (const channel of channels) {
        const ids = channel[1]
        const foundEvents: Event[] = []
        for await (const id of ids) {
            const result = events.find(e => e.id === id)
            if (result) {
                foundEvents.push(result)
            }
        }

        channelsMapped.set(channel[0], foundEvents)
    }

    return channelsMapped
}
