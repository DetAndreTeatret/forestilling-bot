import {
    ChatInputCommandInteraction,
    Collection,
    Guild,
    SlashCommandBuilder,
    TextChannel
} from "discord.js"
import {getEventInfos, scrapeEvents, Event, Worker, DateRange} from "schedgeup-scraper"
import {
    ChannelMemberDifference,
    DiscordCommandError,
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
import {Logger} from "../../common/logging.js"
import {editMessage} from "../../common/util.js"


export const data = new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update show channels in Discord(delete/create/update")

export async function execute(interaction: ChatInputCommandInteraction) {
    if (interaction.guild == null) {
        throw new DiscordCommandError("Guild is null", "update/#execute")
    }


    // First time stuff
    addGuildToUpdate(interaction.guild)
    const roleSnowflake = await fetchSetting("admin_role_snowflake")
    if (roleSnowflake === undefined) {
        const role = await interaction.guild.roles.create({
            name: "SchedgeUps Utvalgte",
            color: "Red",
            reason: "Admin role for SchedgeUpBot",
            mentionable: false,
            hoist: false
        })

        await updateSetting("admin_role_snowflake", role.id)
    }

    const updateMessage = editMessage.bind([await interaction.reply("Ikke tenk på denne meldingen")])
    const logger = new Logger(updateMessage)
    await logger.logLine("Starting update!")
    try {
        const memberDifference = await update(interaction.guild, logger)
        if (interaction.channel !== null) await interaction.channel.send(formatMemberDifference(memberDifference))
    } catch (error) {
        await updateMessage("Encountered error during update + " + error)
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
export async function update(guild: Guild | null, logger: Logger) {
    await logger.logLine("Fetching SchedgeUp Events...")

    const today = new Date()
    // Shift the week such that Monday is day 0, and Sunday is day 6(We want new shows from Monday)
    const eventInfos = await getEventInfos(new DateRange(today, afterDays(6 - (today.getDay() === 0 ? 6 : today.getDay() - 1), today)))
    const events = await scrapeEvents(eventInfos)

    if (guild == null) throw new DiscordCommandError("Guild is null", "update")
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
            const showDay0 = await fetchShowDayByDate(event.date, isEventDaytime)
            if (!showDay0) {

                // No ShowDay anywhere, create a new one
                await logger.logPart("Creating new ShowDay(" + event.title + "/" + renderDateYYYYMMDD(event.date) + ")")
                const channel = await client.createNewChannelForEvent(guild, event, isEventDaytime, logger)
                await createNewShowday(channel.id, event.date, isEventDaytime, event.id)
                channelsMapped.set(channel, [event])

            } else {

                // Found a ShowDay for the event date, merge into it
                await logger.logPart("Adding event(" + event.title + "/" + renderDateYYYYMMDD(event.date) + ") to existing ShowDay")
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
                    await updateCastList(channel, filterDistinctWorkers(events))
                }

            }
        } else {

            // Update showday
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
                await logger.logLine("Updating ShowDay for " + event.title + "/" + renderDateYYYYMMDD(event.date))
                const events = channelsMapped.get(channel)
                if (!events) throw new Error("Could not find any events mapped to channel " + channel)

                // Update members in channel
                channelMemberDifferences.push(await client.updateMembersForChannel(channel, events, logger))


                // Update pinned info messages
                await updateShowsInEventInfoMessage(channel, showDay.when, events.map(e => e.title).join(", ")) // TODO Is a full rebuild every time necessary?
                await updateCastList(channel, filterDistinctWorkers(events))

            }

        }
    }

    await logger.logLine("Update is done!")
    return channelMemberDifferences
}

/**
 * Returns a list of all workers present in the given events, ignoring any duplicates
 */
function filterDistinctWorkers(events: Event[]) {
    const allWorkers = events.map(e => e.workers).flat()
    const allWorkersFiltered: Worker[] = []
    allWorkers.forEach(worker => {
        if (!allWorkersFiltered.some(worker0 => worker0.who === worker.who)) {
            allWorkersFiltered.push(worker)
        }
    })
    return allWorkersFiltered
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
