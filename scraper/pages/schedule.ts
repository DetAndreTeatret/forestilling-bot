import {Page} from "puppeteer"
import {DateRange} from "../../common/date.js"
import {navigateToUrl} from "../browser.js"
import {EnvironmentVariable, needEnvVariable} from "../../common/config.js"

// YYYY-MM-DD
// DD is irrelevant
const SCHEDULE_DATE_FORMAT = "?date=%y-%m-01"

// css selectors
const eventFields = "[class^='eventBlurb']"

export async function getEventIds(page: Page, dateRange: DateRange) {
    const dateStrings: string[] = []
    if(dateRange.isSingleMonth()) {
        await navigateToSchedule(page)
        return await scrapeSchedule(page, dateRange)
    } else {
        console.log("Getting event ids for range " + dateRange.toString())
        let fromMonth = dateRange.dateFrom.getMonth(), fromYear = dateRange.dateFrom.getFullYear()
        while(fromMonth !== dateRange.dateTo.getMonth() + 1 /* Any events in the dateTo.month is on the next page */ || fromYear !== dateRange.dateTo.getFullYear()) {

            dateStrings.push(SCHEDULE_DATE_FORMAT.replace("%y", String(fromYear)).replace("%m", String(fromMonth + 1)))

            if(fromMonth === 11) {
                fromYear++
                fromMonth = 0
            }
            fromMonth++
        }
    }

    const ids: [string, string | undefined][] = []
    for await (const date of dateStrings) {
        await navigateToSchedule(page, date)
        for await (const id of await scrapeSchedule(page, dateRange)) {
            ids.push(id)
        }
    }

    return ids
}

/**
 * string 0 - event id
 * string 1 - show template id, can be undefined
 * @param page
 * @param dateRange
 */
async function scrapeSchedule(page: Page, dateRange?: DateRange) {
    return await page.$$eval(eventFields, (events, dateFrom, dateTo) => {
        const readEvents: [string, string | undefined][] = []

        events.forEach(element => {
            if(dateFrom && dateTo) {
                const dateFromParsed = new Date(dateFrom)
                const dateToParsed = new Date(dateTo)
                // @ts-ignore
                const dateString = element.innerText.split(" ")[1].split("/")
                const date = new Date(20 + dateString[2], dateString[1] - 1, dateString[0])
                if(!(dateFromParsed <= date && date <= dateToParsed)) {
                    return
                }
            }

            let showTemplateId
            element.classList.forEach(className => {
                if(className.startsWith("show_template_")) {
                    showTemplateId = className.split("show_template_")[1]
                }
            })
            // @ts-ignore
            const href: string = element.href
            const id = href.match("\\d+")
            if(id == null || id.length > 1) {
                throw new Error("Regex matched wrongly for event href")
            } else {
                console.info("Found new event " + id[0])
                readEvents.push([id[0], showTemplateId])
            }
        })
        return readEvents
    }, dateRange?.dateFrom, dateRange?.dateTo)
}

async function navigateToSchedule(page: Page, dateString?: string) {
    // Cant be static because the ID is from .env
    const theatreId = needEnvVariable(EnvironmentVariable.THEATRE_ID)
    const SCHEDULE_URL = "https://www.schedgeup.com/theatre/" + theatreId + "/schedule"
    await navigateToUrl(page, dateString == null ? SCHEDULE_URL : SCHEDULE_URL + dateString)
}
