import {createPage, startBrowser} from "./browser.js";
import {login} from "./pages/login.js";
import {getEventIds} from "./pages/schedule.js";
import dotenv from 'dotenv'
import {Page} from "puppeteer";
import {scrapeEvents} from "./pages/eventAssignement.js";
import {parseArgs} from "util";

dotenv.config()

const {
    values: {dateFrom, dateTo}
} = parseArgs( {
    options: {
        dateFrom: {
            type: "string",
            short: "f"
        },
        dateTo: {
            type: "string",
            short: "t"
        }
    }
})

const browser = await startBrowser()
const page= await createPage(browser)

await login(page)

const ids = await getEventIds(page, dateFrom ? new Date(dateFrom) : new Date(), dateTo ? new Date(dateTo) : new Date())
const events = await scrapeEvents(page, ids)

console.log(JSON.stringify(events, null, 1))
process.exit()


export async function navigateToUrl(page: Page, url: string) {
    console.log("Navigating to " + url + "...")
    await page.goto(url, {waitUntil: "networkidle2"})
}