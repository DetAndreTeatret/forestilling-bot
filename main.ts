import {createPage, startBrowser} from "./scraper/browser.js";
import {loginSchedgeUp} from "./scraper/pages/login.js";
import {getEventIds} from "./scraper/pages/schedule.js";
import dotenv from 'dotenv'
import {scrapeEvents} from "./scraper/pages/eventAssignement.js";
import {parseArgs} from "util";
import {DateRange, tomorrow} from "./common/date.js";
import {DiscordCommandError, startDiscordClient, SuperClient} from "./discord/discord";
import {ChatInputCommandInteraction} from "discord.js";
import {getDeleteableChannels, getRemovableUsers, queChannelDeletion} from "./database/discord";

dotenv.config()

const {
    values: {dateFrom, dateTo}
} = parseArgs( {
    options: {
        //YYYY-MM-DD
        dateFrom: {
            type: "string",
            short: "f"
        },
        //YYYY-MM-DD
        dateTo: {
            type: "string",
            short: "t"
        }
    }
})

//await startDaemon() TODO

const browser = await startBrowser()
const page= await createPage(browser)
await loginSchedgeUp(page)

const ids = await getEventIds(page, new DateRange(dateFrom ? new Date(dateFrom) : new Date(), dateTo ? new Date(dateTo) : new Date()))
const events = await scrapeEvents(page, ids)

const discordClient = await startDiscordClient()

console.log(JSON.stringify(events, null, 1))
process.exit()

export async function update(interaction: ChatInputCommandInteraction) {
    //Its important that this only includes events for the current week!
    //Any running channels belonging to events not fetched here will be deleted after some time
    const events = await scrapeEvents(page, await getEventIds(page, new DateRange(new Date(), new Date()))) //TODO: Fetch for current week only!

    const client = interaction.client as SuperClient
    if(interaction.guild == null) throw new DiscordCommandError("Guild is null", "update")
    const channels = await client.mapRunningChannels(interaction.guild)

    //Check if any running channels are old
    channels.forEach((channel, id) => {
        const now = new Date()
        if(!events.find(e => e.id == id)) {
            queChannelDeletion(channel, tomorrow())
        }
    })

    //Check if any events this week has any changes compared to their running discord channel - Add/Remove members
    channels.forEach((channel, id) => {
        const event = events.find(e => e.id == id)
        if(event == undefined) return
        (interaction.client as SuperClient).updateMembersForChannel(channel, event)
    })

    //Check if any events this week is not posted - TODO: Send requests to create channels
    for (let event of events) {
        if(!channels.find((channel, id) => id == event.id)) {
            console.log("Creating discord channel for event " + event)
            await (interaction.client as SuperClient).createNewChannelForEvent(interaction.guild, event)
        }
    }
}

async function startDaemon() {
    setTimeout(checkDeletions, 1000 * 60 * 60) //One hour
}

export async function checkDeletions()  {
    const channelIdsToDelete = await getDeleteableChannels()
    for (let channelsToDeleteElement of channelIdsToDelete) {
        const channel = await discordClient.channels.fetch(channelsToDeleteElement)
        if(channel != null) channel.delete("Event related to this channel has ended")
    }

    //Skip the full #update cycle, just remove channels we've already deleted
    discordClient.channelCache = discordClient.channelCache.filter((channel, string) => {
        !channelIdsToDelete.includes(channel.id)
    })

    for (let channelCacheElement of discordClient.channelCache) {
        const channel = channelCacheElement[1]
        const usersToRemove = await getRemovableUsers(channel)
        for (let userToRemove of usersToRemove) {
            const discordUser = await channel.guild.members.fetch(userToRemove)
            await channel.permissionOverwrites.edit(discordUser, {SendMessages: false, ViewChannel: false}) //TODO: This should be in discord/discord.ts
        }
    }

}
