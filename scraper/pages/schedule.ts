import {Page} from "puppeteer";
import {DateRange} from "../../common/date.js";
import {navigateToUrl} from "../browser.js";

//YYYY-MM-DD
//DD is irrelevant
const SCHEDULE_DATE_FORMAT = "?date=%y-%m-01"

//css selectors
const eventFields = "[class^='eventBlurb']"

export async function getEventIds(page: Page, dateRange: DateRange) {
    const dateStrings: string[] = []
    if(!dateRange.isSingleMonth()) {
        console.log("Getting event ids for range " + dateRange.toString())
        let fromMonth = dateRange.dateFrom.getMonth(), toMonth = dateRange.dateTo.getMonth(), fromYear = dateRange.dateFrom.getFullYear()
        while(true) {
            if(fromMonth > 13) {
                fromMonth = 1
            }

            dateStrings.push(SCHEDULE_DATE_FORMAT.replace("%y", String(fromYear)).replace("%m", String(fromMonth + 1)))

            if(fromMonth == toMonth) {
                if (fromYear == dateRange.dateTo.getFullYear()) {
                    break;
                }
                fromYear++
            }
            fromMonth++
        }
    } else {
        await navigateToSchedule(page)
        return await scrapeSchedule(page)
    }

    const ids: string[] = []
    for (const date of dateStrings) {
        await navigateToSchedule(page, date)
        for (const id of await scrapeSchedule(page)) {
            ids.push(id)
        }
    }

    return ids
}

async function scrapeSchedule(page: Page, dateRange?: DateRange) {
    return await page.$$eval(eventFields, (events, dateRange) => {
        const readEvents: string[] = []
        events.forEach(element => {

            //@ts-ignore
            const dateString = element.innerText.split(" ")[1].split("/")
            const date = new Date(dateString[2], dateString[1], dateString[0])

            if(dateRange !== undefined && !dateRange.contains(date)) {
                return
            }
            //TODO how to remove this error? The element in question does in fact have a href
            //@ts-ignore
            const href: string = element.href
            const id = href.match("\\d+")
            if(id == null || id.length > 1) {
                throw new Error("Regex matched wrongly for event href")
            } else {
                console.info("Found new event " + id[0])
                readEvents.push(id[0])
            }
        })
        return readEvents
    }, dateRange)
}

async function navigateToSchedule(page: Page, dateString?: string) {
    //Cant be static because the ID is from .env
    const SCHEDULE_URL = `https://www.schedgeup.com/theatre/${process.env["THEATRE_ID"]!}/schedule`
    await navigateToUrl(page, dateString == null ? SCHEDULE_URL : SCHEDULE_URL + dateString)
}