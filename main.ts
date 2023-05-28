import {createPage, startBrowser} from "./scraper/browser.js";
import {loginSchedgeUp} from "./scraper/pages/login.js";
import {getEventIds} from "./scraper/pages/schedule.js";
import dotenv from 'dotenv'
import {Page} from "puppeteer";
import {scrapeEvents} from "./scraper/pages/eventAssignement.js";
import {parseArgs} from "util";
import {DateRange} from "./common/date.js";

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
