import {setupConfig} from "./common/config.js"
import {createPage, startBrowser} from "./scraper/browser.js"

export async function setupScraper() {
    console.log("Starting setup for schedgeup-scraper...")
    setupConfig()
    await startBrowser()
    await createPage()
    console.log("Finished setup for schedgeup-scraper!")
}

export {ScheduleEventInfo, getEventInfos} from "./scraper/pages/schedule.js"
export {Worker, Event, scrapeEvents} from "./scraper/pages/eventAssignement.js"
export {scrapeUsers} from "./scraper/pages/users.js"
export {DateRange} from "./common/date.js"
