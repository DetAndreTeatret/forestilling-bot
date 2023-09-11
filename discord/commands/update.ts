import {
    ChatInputCommandInteraction,
    Collection,
    Guild,
    SlashCommandBuilder,
    TextChannel
} from "discord.js"
import {DiscordCommandError, SuperClient, updateShowsInEventStatusMessage} from "../discord.js"
import {afterDays, DateRange, renderDateYYYYMMDD} from "../../common/date.js"
import {getEventIds} from "../../scraper/pages/schedule.js"
import {scrapeEvents, Event} from "../../scraper/pages/eventAssignement.js"
import {addGuildToUpdate, startDaemon} from "../daemon.js"
import {page} from "../../scraper/browser.js"
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
        await update(interaction.guild, logger)
    } catch (error) {
        await updateMessage("Encountered error during update + " + error)
        throw error
    }

    startDaemon() // Only start daemon after first update to ensure local channelCache is updated
}

/**
 * Look for changes in SchedgeUp
 */
export async function update(guild: Guild | null, logger: Logger) {
    await logger.logLine("Fetching SchedgeUp Events...")

    // Its important that this only includes events for the current week!!!!!!
    // Any running channels belonging to events not fetched here will be deleted after some time
    const today = new Date()
    // Shift the week such that Monday is day 0, and Sunday is day 6(We want new shows from Monday)
    const eventInfos = await getEventIds(page, new DateRange(today, afterDays(6 - (today.getDay() === 0 ? 6 : today.getDay() - 1), today)))
    const events = await scrapeEvents(page, eventInfos)
    if (guild == null) throw new DiscordCommandError("Guild is null", "update")
    const client = guild.client as SuperClient
    await logger.logLine("Mapping currently running Discord channels...")
    const channels = await client.mapRunningChannels(guild)

    const channelsMapped = await mapChannelsToEvents(channels, events)

    // Find ShowDay and channel belonging to event, if none check if channel for show day exists, if not created a new ShowDay instance

    for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const isEventDaytime = event.showTemplateId === undefined ? false : await isDayTimeShow(event.showTemplateId, event.title)
        const showDay = await fetchShowDayBySU(event.id, isEventDaytime)
        if (!showDay) {
            // No ShowDay for the given found, maybe there is one for the given date?
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
                    await client.updateMembersForChannel(channel, events, logger)
                    await updateShowsInEventStatusMessage(channel, showDay0.when, events.map(e => e.title).join(", "))
                }
            }
        } else {
            // Update showday
            const channel = channelsMapped.findKey((e, c) => c.id === showDay.discordChannelSnowflake)
            if (!channel) {
                throw new Error("Could not find channel belonging to ShowDay " + renderDateYYYYMMDD(showDay.when))
            } else {
                await logger.logLine("Looking for worker updates in " + event.title + "/" + renderDateYYYYMMDD(event.date))
                const events = channelsMapped.get(channel)
                if (!events) throw new Error("Could not find any events mapped to channel " + channel)
                await client.updateMembersForChannel(channel, events, logger)
            }
        }
    }

    await logger.logLine("Update is done!")
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
