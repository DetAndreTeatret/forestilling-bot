import {createPage, startBrowser} from "./scraper/browser.js";
import {loginSchedgeUp} from "./scraper/pages/login.js";
import {getEventIds} from "./scraper/pages/schedule.js";
import {scrapeEvents} from "./scraper/pages/eventAssignement.js";
import {parseArgs} from "util";
import {DateRange, tomorrow} from "./common/date.js";
import {DiscordCommandError, startDiscordClient, SuperClient} from "./discord/discord.js";
import {ChatInputCommandInteraction} from "discord.js";
import {getDeleteableChannels, getRemovableUsers, queChannelDeletion} from "./database/discord.js";
import {scrapeUsers} from "./scraper/pages/users.js";
import dotenv from "dotenv";
import {Page} from "puppeteer";
import {createTables} from "./database/sqlite.js";

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
dotenv.config()

//await startDaemon() TODO
let discordClient: SuperClient
let page: Page
export async function letsGo() {
    discordClient = await startDiscordClient()
    const browser = await startBrowser()
    page= await createPage(browser)
    await loginSchedgeUp(page)
    await createTables()

    //const users = await scrapeUsers(page)

    //const ids = await getEventIds(page, new DateRange(dateFrom ? new Date(dateFrom) : new Date(), dateTo ? new Date(dateTo) : tomorrow()))
    //const events = await scrapeEvents(page, ids)

    //console.log(JSON.stringify(events, null, 1))
}





export async function update(interaction: ChatInputCommandInteraction) {
    //Its important that this only includes events for the current week!
    //Any running channels belonging to events not fetched here will be deleted after some time
    const events = await scrapeEvents(page, await getEventIds(page, new DateRange(new Date(), tomorrow()))) //TODO: Fetch for current week only!
    const client = interaction.client as SuperClient
    if(interaction.guild == null) throw new DiscordCommandError("Guild is null", "update")
    const channels = await client.mapRunningChannels(interaction.guild)

    //Check if any running channels are old
    channels.forEach((channel, id) => {
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
    for (const event of events) {
        if(!channels.find((channel, id) => id == event.id)) {
            console.log("Creating discord channel for event " + event.title)
            await (interaction.client as SuperClient).createNewChannelForEvent(interaction.guild, event)
        }
    }
}

async function startDaemon() {
    setTimeout(checkDeletions, 1000 * 60 * 60) //One hour
}

export async function checkDeletions()  {
    const channelIdsToDelete = await getDeleteableChannels()
    for (const channelsToDeleteElement of channelIdsToDelete) {
        const channel = await discordClient.channels.fetch(channelsToDeleteElement)
        if(channel != null) channel.delete("Event related to this channel has ended") //TODO: Remove deletion cue entry from database
    }

    //Skip the full #update cycle, just remove channels we've already deleted
    discordClient.channelCache = discordClient.channelCache.filter((channel) => {
        !channelIdsToDelete.includes(channel.id)
    })

    for (const channelCacheElement of discordClient.channelCache) {
        const channel = channelCacheElement[1]
        const usersToRemove = await getRemovableUsers(channel)
        for (const userToRemove of usersToRemove) {
            const discordUser = await channel.guild.members.fetch(userToRemove)
            //TODO: This should be in discord/discord.ts
            await channel.permissionOverwrites.edit(discordUser, {SendMessages: false, ViewChannel: false}) //TODO: Remove deletion cue entry from database

        }
    }

}
