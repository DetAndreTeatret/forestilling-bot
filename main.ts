import {createPage, startBrowser} from "./scraper/browser.js";
import {loginSchedgeUp} from "./scraper/pages/login.js";
import {getEventIds} from "./scraper/pages/schedule.js";
import {scrapeEvents} from "./scraper/pages/eventAssignement.js";
import {parseArgs} from "util";
import {DateRange, oneMinute, tomorrow} from "./common/date.js";
import {DiscordCommandError, removeMemberFromChannel, startDiscordClient, SuperClient} from "./discord/discord.js";
import {ChatInputCommandInteraction} from "discord.js";
import {getDeleteableChannels, getRemovableUsers, queChannelDeletion} from "./database/discord.js";
import dotenv from "dotenv";
import {Page} from "puppeteer";
import {createTables, deleteEntries} from "./database/sqlite.js";

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

let discordClient: SuperClient
let page: Page
export async function letsGo() {
    discordClient = await startDiscordClient()
    const browser = await startBrowser()
    page = await createPage(browser)
    await loginSchedgeUp(page)
    await createTables()
}

export async function update(interaction: ChatInputCommandInteraction) {

    //Its important that this only includes events for the current week!
    //Any running channels belonging to events not fetched here will be deleted after some time
    const events = await scrapeEvents(page, await getEventIds(page, new DateRange(new Date(), new Date("2023-08-01")))) //TODO: Fetch for current week only!
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
    channels.forEach(await async function (channel, id)  {
        const event = events.find(e => e.id == id)
        if(event == undefined) return
        await (interaction.client as SuperClient).updateMembersForChannel(channel, event)
    })

    //Check if any events this week is not posted - TODO: Send requests to create channels
    for await (const event of events) {
        if(!channels.find((channel, id) => id == event.id)) {
            console.log("Creating discord channel for event " + event.title)
            await (interaction.client as SuperClient).createNewChannelForEvent(interaction.guild, event)
        }
    }

    startDaemon() //Only start daemon after first update to ensure local channelCache is updated
}

let daemonStarted = false
function startDaemon() {
    if(daemonStarted) return
    daemonStarted = true
    const interval = 1000 * 60 //One hour //TODO - configurable
    console.info("Starting deletion daemon!(Interval: " + (interval / 1000) + " seconds)")
    setInterval(checkDeletions, interval)
}

export async function checkDeletions()  {
    console.log("Starting check for channels/users to remove...")
    const channelIdsToDelete = await getDeleteableChannels()
    for await (const channelsToDeleteElement of channelIdsToDelete) {
        const channel = await discordClient.channels.fetch(channelsToDeleteElement)
        if(channel != null) {
            channel.delete("Event related to this channel has ended")
            await deleteEntries("DiscordChannelDeletions", "DiscordChannelSnowflake=\"" + channel.id + "\"")
        }
    }

    //Skip the full #update cycle, just remove channels we've already deleted
    discordClient.channelCache = discordClient.channelCache.filter(channel => !channelIdsToDelete.includes(channel.id))

    for await (const channelCacheElement of discordClient.channelCache) {
        const channel = channelCacheElement[1]
        const usersToRemove = await getRemovableUsers(channel)
        for await (const userToRemove of usersToRemove) {
            const discordUser = await channel.guild.members.fetch(userToRemove)
            //TODO: This should be in discord/discord.ts
            await removeMemberFromChannel(channel, discordUser.user)
            await deleteEntries("DiscordUserRemovals", "DiscordChannelSnowflake=\"" + channel.id + "\" AND DiscordUserSnowflake=\"" + discordUser.id + "\"")
        }
    }

}
