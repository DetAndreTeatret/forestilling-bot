import {Page} from "puppeteer";
import {navigateToUrl} from "../main.js";

//YYYY-MM-DD
//DD is irrelevant
const SCHEDULE_DATE_FORMAT = "?date=%y-%m-01"

//css selectors
const eventFields = "[class^='eventBlurb']"

export async function getEventIds(page: Page, dateFrom: Date, dateTo: Date) {
    const dateStrings: string[] = []
    if(dateFrom.getMonth() < dateTo.getMonth() || dateFrom.getFullYear() < dateTo.getFullYear()) {
        console.log("Getting event ids for range " + formatDateYYYYMM(dateFrom) + " to " + formatDateYYYYMM(dateTo))
        let fromMonth = dateFrom.getMonth(), toMonth = dateTo.getMonth(), fromYear = dateFrom.getFullYear()
        while(true) {
            if(fromMonth > 13) {
                fromMonth = 1
            }

            dateStrings.push(SCHEDULE_DATE_FORMAT.replace("%y", String(fromYear)).replace("%m", String(fromMonth + 1)))

            if(fromMonth == toMonth) {
                if (fromYear == dateTo.getFullYear()) {
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

async function scrapeSchedule(page: Page) {
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

function formatDateYYYYMM(date: Date) {
    return "" + date.getFullYear() + "-" + (date.getMonth() + 1)
}

async function navigateToSchedule(page: Page, dateString?: string) {
    //Cant be static because the ID is from .env
    const SCHEDULE_URL = `https://www.schedgeup.com/theatre/${process.env["THEATRE_ID"]!}/schedule`
    await navigateToUrl(page, dateString == null ? SCHEDULE_URL : SCHEDULE_URL + dateString)
}