import {ChannelType, ChatInputCommandInteraction, Collection, Guild, SlashCommandBuilder, TextChannel} from "discord.js"
import {DateRange, Event, getEventInfos, scrapeEvents} from "schedgeup-scraper"
import {updateCastList, updateEventInfo} from "../embeds.js"
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
import {ConsoleLogger, DelegatingLogger, DiscordMessageReplyLogger, Logger} from "../../common/logging.js"
import {needNotNullOrUndefined} from "../../common/util.js"
import {
    ChannelMemberDifference,
    createNewChannelForEvent,
    mapRunningChannels,
    updateMembersForChannel
} from "../channels.js"


export const data = new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update show channels in Discord(delete/create/update")

const logger = new ConsoleLogger("[Update]")

export async function execute(interaction: ChatInputCommandInteraction) {
    const delegatingLogger = new DelegatingLogger([new DiscordMessageReplyLogger(interaction), logger])
    await delegatingLogger.logLine("Starting update!")
    try {
        const guild = needNotNullOrUndefined(interaction.guild, "guild")
        const memberDifference = await update(guild, delegatingLogger)
        const channel = interaction.channel
        if (channel !== null && channel.type === ChannelType.GuildText) await channel.send(formatMemberDifference(memberDifference))
    } catch (error) {
        await delegatingLogger.logWarning("Encountered error during update + " + error)
        throw error
    }
}

function formatMemberDifference(differences: ChannelMemberDifference[]) {
    let membersBuilder = ""

    differences.forEach(difference => {
        const channelPrefix = "\n\n#" + difference.channel.name
        let s = "" + channelPrefix

        if (difference.membersAdded.length !== 0) {
            s += ", Added: " + difference.membersAdded.map(member => member.nickname !== null ? member.nickname : member.displayName).join(",")
        }


        if (difference.membersRemoved.length !== 0) {
            s += ", Removed: " + difference.membersRemoved.map(member => member.nickname !== null ? member.nickname : member.displayName).join(",")
        }

        if (s !== channelPrefix) {
            membersBuilder += s
        }
    })

    let rolesBuilder = ""

    differences.forEach(difference => {
        const channelPrefix = "\n\n#" + difference.channel.name
        let s = "" + channelPrefix

        if (difference.rolesAdded.length !== 0) {
            s += ", Added: " + difference.rolesAdded.map(role => role.name).join(",")
        }

        if (difference.rolesRemoved.length !== 0) {
            s += ", Removed: " + difference.rolesRemoved.map(role => role.name).join(",")
        }

        if (s !== channelPrefix) {
            rolesBuilder += s
        }
    })

    const result =
        (membersBuilder !== "" ? "Members added/removed during update:" + membersBuilder : "") +
        (rolesBuilder !== "" ? (membersBuilder !== "" ? "\n\n" : "") + "Roles added/removed during update:" + rolesBuilder : "")

    return result !== "" ? result : "No members or roles was added or removed from any channels in this update"
}

/**
 * Look for changes in SchedgeUp
 * @return All members removed or added during the update
 */
export async function update(guild: Guild, logger: Logger) {
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

    await logger.logLine("Fetching SchedgeUp Events...")

    const today = new Date()
    // Shift the week such that Monday is day 0, and Sunday is day 6(We want new shows from Monday)
    const eventInfos = await getEventInfos(new DateRange(today, afterDays(6 - (today.getDay() === 0 ? 6 : today.getDay() - 1), today)), false)
    let events = await scrapeEvents(eventInfos)
    // We filter out events we don't want to create a show for here, a little weird but probably fine
    events = events.filter(event => {
            const title = event.title.toLowerCase()
            if (title.includes("prøve")) return false
            // This solution is to prevent the need to search for "turn" three times for each possible ending, and I don't trust users on their grammar
            // Checks for "turne", "turné" and "turnè"
            if (title.includes("turn")) {
                const c = event.title.charAt(event.title.indexOf("turn") + 4).toLowerCase()
                if (c === "e" || c === "è" || c === "é") return false
            }
            return true
    })

    await logger.logLine("Mapping currently running Discord channels...")
    const channels = await mapRunningChannels(guild)
    const channelsMapped = await mapChannelsToEvents(channels, events)

    const daysUpdated: TextChannel[] = []
    const channelMemberDifferences: ChannelMemberDifference[] = []

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
                const channel = await createNewChannelForEvent(guild, event, isEventDaytime, logger)
                channelMemberDifferences.push(new ChannelMemberDifference(channel, Array.from(channel.members.values()), [], [], [])) // TODO get added roles in here
                await createNewShowday(channel.id, event.eventStartTime, isEventDaytime, event.id)
                channelsMapped.set(channel, [event])

            } else {

                // Found a ShowDay for the event date, merge into it
                await logger.logPart("Adding event(" + event.title + "/" + renderDateYYYYMMDD(event.eventStartTime) + ") to existing ShowDay")
                await addEventToShowDay(showDay0, event.id)
                const channel = channelsMapped.findKey((e, c) => c.id === showDay0.discordChannelSnowflake)
                if (channel) {
                    const events = channelsMapped.get(channel)
                    if (!events) throw new Error("Could not find any events mapped to channel " + channel)
                    events.push(event)

                    // Merge successful, now update channel with new members
                    channelMemberDifferences.push(await updateMembersForChannel(channel, events, logger))

                    // Update pinned info messages
                    await updateEventInfo(channel, showDay0.when, events.map(e => e.title).join(", "))
                    await updateCastList(channel, events, showDay0.dayTimeShows)
                } else {
                    throw new Error("Could not find channel belonging to ShowDay " + renderDateYYYYMMDD(showDay0.when))
                }

            }
        } else {

            // Update showday
            // TODO can be fetched with discord api instead probably
            const channel = channelsMapped.findKey((e, c) => c.id === showDay.discordChannelSnowflake)
            if (channel) {

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
                channelMemberDifferences.push(await updateMembersForChannel(channel, events, logger))

                // Update pinned info messages
                await updateEventInfo(channel, showDay.when, events.map(e => e.title).join(", ")) // TODO Is a full rebuild every time necessary?
                await updateCastList(channel, events, showDay.dayTimeShows)

            } else {
                throw new Error("Could not find channel belonging to ShowDay " + renderDateYYYYMMDD(showDay.when))
            }

        }
    }

    await logger.logLine("Update is done!")
    startDaemon() // Only start daemon after first update to ensure local channelCache is updated

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
