import {ChatInputCommandInteraction, Guild, InteractionResponse, SlashCommandBuilder} from "discord.js"
import {DiscordCommandError, SuperClient} from "../discord.js"
import {afterDays, DateRange, tomorrow} from "../../common/date.js"
import {queChannelDeletion} from "../../database/discord.js"
import {getEventIds} from "../../scraper/pages/schedule.js"
import {scrapeEvents} from "../../scraper/pages/eventAssignement.js"
import {addGuildToUpdate, startDaemon} from "../daemon.js"
import {page} from "../../scraper/browser.js"


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
        startDaemon() //Only start daemon after first update to ensure local channelCache is updated
}

/**
 * Look for changes in SchedgeUp
 */
export async function update(guild: Guild | null, logger: (newPart: string) => Promise<void>) {
        await logger("Fetching SchedgeUp Events...")

        //Its important that this only includes events for the current week!!!!!!
        //Any running channels belonging to events not fetched here will be deleted after some time
        const today = new Date()
        //Shift the week such that Monday is day 0, and Sunday is day 6(We want new shows from Monday)
        const eventIds = await getEventIds(page, new DateRange(today, afterDays(6 - (today.getDay() === 0 ? 6 : today.getDay() - 1), today)))
        let events = await scrapeEvents(page, eventIds)
        if(guild == null) throw new DiscordCommandError("Guild is null", "update")
        const client = guild.client as SuperClient
        await logger("Mapping currently running Discord channels...")
        const channels = await client.mapRunningChannels(guild)

        await logger("Checking if any running channels are old...")
        channels.forEach((channel, id) => {
                if(!events.find(e => e.id == id)) {
                        queChannelDeletion(channel, tomorrow())
                }
        })

        await logger("Checking if any events this week has members to remove/add...")
        channels.forEach(await async function (channel, id)  {
                const event = events.find(e => e.id == id)
                if(event == undefined) return
                await client.updateMembersForChannel(channel, event, false)
        })

        const eventsCopy = Array.from(events)

        for (let i = 0; i < eventsCopy.length; i++) {
                const event = eventsCopy[i]
                const result = events.filter(e => e.showTemplateId = event.showTemplateId)
                if(result.length > 1) {
                    events = events.filter(e => !(e.showTemplateId == event.showTemplateId))

                    let channel

                    //Does a channel for the run exist?
                    channel = channels.get(result[0].showTemplateId + "R")
                    //If not, create a channel for the run
                    if(channel == undefined) channel = await client.createNewChannelForEvent(guild, result[0], true)

                    //Add the rest of workers not present in the first event
                    for (let j = 1; j < result.length; j++) {
                        await client.updateMembersForChannel(channel, result[i], true)
                    }
                }
        }

        //TODO: Send requests to create channels
        await logger("Checking if any events this week needs to be posted...")
        for await (const event of events) {
                if(!channels.find((channel, id) => id == event.id)) {
                        console.log("Creating discord channel for event " + event.title)
                        await client.createNewChannelForEvent(guild, event, false)
                }
        }

        await logger("Update is done!")
}

async function editMessage(this: [string, InteractionResponse], newPart: string) {
        this[0] = this[0] + "\n" + newPart
        await this[1].edit(this[0])
}

