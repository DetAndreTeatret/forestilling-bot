import {createPage, startBrowser} from "./scraper/browser.js";
import {loginSchedgeUp} from "./scraper/pages/login.js";
import {getEventIds} from "./scraper/pages/schedule.js";
import dotenv from 'dotenv'
import {Page} from "puppeteer";
import {scrapeEvents} from "./scraper/pages/eventAssignement.js";
import {parseArgs} from "util";
import {DateRange} from "./common/date.js";
import {DiscordCommandError, SuperClient} from "./discord/discord";
import {ChatInputCommandInteraction} from "discord.js";
import {read} from "fs";

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
        if(!events.find(e => e.id == id)) {
            startDeletion(channel)
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
