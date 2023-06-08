import {createPage, startBrowser} from "./scraper/browser.js";
import {loginSchedgeUp} from "./scraper/pages/login.js";
import {getEventIds} from "./scraper/pages/schedule.js";
import dotenv from 'dotenv'
import {Page} from "puppeteer";
import {scrapeEvents} from "./scraper/pages/eventAssignement.js";
import {parseArgs} from "util";
import {DateRange, tomorrow} from "./common/date.js";
import {DiscordCommandError, SuperClient} from "./discord/discord";
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

console.log(JSON.stringify(events, null, 1))
process.exit()

export async function update(interaction: ChatInputCommandInteraction) {
    //Its important that this only includes events for the current week!
    //Any running channels belonging to events not fetched here will be deleted after some time
    const events = await scrapeEvents(page, await getEventIds(page, new DateRange(new Date(), new Date()))) //TODO: Fetch for current week only!

    const client = interaction.client as SuperClient
    if(interaction.guild == null) throw new DiscordCommandError("Guild is null", "update")
    const channels = await client.mapRunningChannels(interaction.guild)

    //Check if any running channels are old - TODO: start deletion process
    channels.forEach((channel, id) => {
        const now = new Date()
        if(!events.find(e => e.id == id)) {
            queChannelDeletion(channel, tomorrow())
        }
    })

    //Check if any events this week has any changes compared to their running discord channel - Add members, TODO: start timer to remove old members?
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
    setTimeout(function () {
        getDeleteableChannels() //TODO: Delete these

        /*
        for each running channel

        getRemovableUsers(channel)

        remove them...
        */

    }, 1000 * 60 * 60) //One hour

}
