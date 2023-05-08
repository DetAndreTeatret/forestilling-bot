import {Page} from "puppeteer";
import {navigateToUrl} from "../main.js";

//css selectors

const eventFields = "[class^='eventBlurb']"
export async function getEventIds(page: Page) { //TODO: Add date range("?date=YYYY-MM-DD")
    console.log("Reading all events from schedule page")
    //console.log(await page.content())
    await page.waitForSelector(eventFields)
    return await page.$$eval(eventFields, (events) => {
        const readEvents: string[] = []
        events.forEach((event) => {
            const href: string = event.href
            const id = href.match("\\d+")
            if(id == null || id.length > 1) {
                throw new Error("Regex matched wrongly for event href")
            } else {
                console.info("Found new event " + id[0])
                readEvents.push(id[0])
            }
        })
        return readEvents
    })
}

export async function navigateToSchedule(page: Page) {
    //Cant be static because the ID is from .env
    const SCHEDULE_URL = `https://www.schedgeup.com/theatre/${process.env["THEATRE_ID"]!}/schedule`
    await navigateToUrl(page, SCHEDULE_URL)
}