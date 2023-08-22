import {
        ChatInputCommandInteraction,
        Collection,
        Guild,
        InteractionResponse,
        SlashCommandBuilder,
        TextChannel
} from "discord.js"
import {DiscordCommandError, SuperClient} from "../discord.js"
import {afterDays, DateRange} from "../../common/date.js"
import {getEventIds} from "../../scraper/pages/schedule.js"
import {scrapeEvents, Event} from "../../scraper/pages/eventAssignement.js"
import {addGuildToUpdate, startDaemon} from "../daemon.js"
import {page} from "../../scraper/browser.js"
import {addEventToShowDay, createNewShowday, fetchShowDayByDate, fetchShowDayBySU} from "../../database/showday.js"


export const data = new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update show channels in Discord(delete/create/update")

export async function execute(interaction: ChatInputCommandInteraction) {
        const initialMessage = "Starting update!"
        const updateMessage = editMessage.bind([initialMessage, await interaction.reply(initialMessage)])
        if(interaction.guild == null) {
                throw new DiscordCommandError("Guild is null", "update/#execute")
        }
        await update(interaction.guild, updateMessage)
        addGuildToUpdate(interaction.guild)
        startDaemon() // Only start daemon after first update to ensure local channelCache is updated
}

/**
 * Look for changes in SchedgeUp
 */
export async function update(guild: Guild | null, logger: (newPart: string) => Promise<void>) {
        try {
                await logger("Fetching SchedgeUp Events...")

                // Its important that this only includes events for the current week!!!!!!
                // Any running channels belonging to events not fetched here will be deleted after some time
                const today = new Date()
                // Shift the week such that Monday is day 0, and Sunday is day 6(We want new shows from Monday)
                const eventIds = await getEventIds(page, new DateRange(today, afterDays(6 - (today.getDay() === 0 ? 6 : today.getDay() - 1), today)))
                const events = await scrapeEvents(page, eventIds)
                if (guild == null) throw new DiscordCommandError("Guild is null", "update")
                const client = guild.client as SuperClient
                await logger("Mapping currently running Discord channels...")
                const channels = await client.mapRunningChannels(guild)

                const channelsMapped = await mapChannelsToEvents(channels, events)

                // Find ShowDay and channel belonging to event, if none check if channel for show day exists, if not created a new ShowDay instance

                for (let i = 0; i < events.length; i++) {
                        const event = events[i]
                        const showDay = await fetchShowDayBySU(event.id)
                        if (!showDay) {
                                // No ShowDay for the given found, maybe there is one for the given date?
                                const showDay0 = await fetchShowDayByDate(event.date)
                                if (!showDay0) {
                                        // No ShowDay anywhere, create a new one
                                        await logger("Creating new ShowDay(" + event.title + "/" + event.date.toString() + ")")
                                        const channel = await client.createNewChannelForEvent(guild, event)
                                        await createNewShowday(channel.id, event.date, event.id)
                                } else {
                                        // Found a ShowDay for the event date, merge into it
                                        await logger("Adding event(" + event.title + "/" + event.date.toString() + ") to existing ShowDay")
                                        await addEventToShowDay(showDay0, event.id)
                                        const channel = channelsMapped.findKey((e, c) => c.id === showDay0.discordChannelSnowflake)
                                        if (!channel) {
                                                throw new Error("Could not find channel belonging to ShowDay " + showDay0)
                                        } else {
                                                const events = channelsMapped.get(channel)
                                                if(!events) throw new Error("Could not find any events mapped to channel " + channel)
                                                await client.updateMembersForChannel(channel, events)
                                        }
                                }
                        } else {
                                // Update showday
                                const channel = channelsMapped.findKey((e, c) => c.id === showDay.discordChannelSnowflake)
                                if (!channel) {
                                        throw new Error("Could not find channel belonging to ShowDay " + showDay)
                                } else {
                                        await logger("Looking for worker updates in " + event.title + "/" + event.date.toString())
                                        const events = channelsMapped.get(channel)
                                        if(!events) throw new Error("Could not find any events mapped to channel " + channel)
                                        await client.updateMembersForChannel(channel, events)
                                }
                        }
                }

                await logger("Update is done!")
        } catch (error) {
                await logger("Encountered error during update: " + error)
        }
}

async function mapChannelsToEvents(channels: Collection<TextChannel, string[]>, events: Event[]) {
        const channelsMapped: Collection<TextChannel, Event[]> = new Collection<TextChannel, Event[]>()
        for await (const channel of channels) {
              const ids = channel[1]
                const foundEvents: Event[] = []
                for await (const id of ids) {
                        const result = events.find(e => e.id = id)
                        if (result) {
                                foundEvents.push(result)
                        }
                }

                channelsMapped.set(channel[0], foundEvents)
        }

        return channelsMapped
}

async function editMessage(this: [string, InteractionResponse], newPart: string) {
        this[0] = this[0] + "\n" + newPart
        await this[1].edit(this[0])
}

