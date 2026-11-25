import {Page} from "puppeteer"
import {DateRange} from "../../common/date.js"
import {getSchedgeUpPage, navigateToUrl} from "../browser.js"
import {EnvironmentVariable, needEnvVariable} from "../../common/config.js"

// YYYY-MM-DD
// DD is irrelevant
const SCHEDULE_DATE_FORMAT = "?date=%y-%m-01"

// css selectors
const eventFields = "[class^='eventBlurb']"

export class ScheduleEventInfo {
    id: string
    showtemplateId: string | undefined
    eventCallTime: Date
    eventStartTime: Date


    constructor(id: string, showtemplateId: string | undefined, eventCallTime: Date, eventStartTime: Date) {
        this.id = id
        this.showtemplateId = showtemplateId
        this.eventCallTime = eventCallTime
        this.eventStartTime = eventStartTime
    }
}

/**
 * Get initial event info for all events matching the given date range
 * @param dateRange The period of time which to look for events
 * @param includeUnpostedEvents if unposted events be included in the results
 */
export async function getEventInfos(dateRange: DateRange, includeUnpostedEvents: boolean) {
    const pageAndReleaser = await getSchedgeUpPage()
    const dateStrings: string[] = []
    if (dateRange.isSingleMonth()) {
        console.log("Getting event ids for month " + dateRange.dateFrom.getMonth())
        await navigateToSchedule(pageAndReleaser.page())
        const scheduleEventInfos = await scrapeSchedule(pageAndReleaser.page(), includeUnpostedEvents, dateRange)
        pageAndReleaser.release()
        return scheduleEventInfos
    } else {
        console.log("Getting event ids for range " + dateRange.toString())
        let fromMonth = dateRange.dateFrom.getMonth(), fromYear = dateRange.dateFrom.getFullYear()
        const toMonth = dateRange.dateTo.getMonth(), toYear = dateRange.dateTo.getFullYear()
        do {
            dateStrings.push(SCHEDULE_DATE_FORMAT.replace("%y", String(fromYear)).replace("%m", String(fromMonth + 1)))

            if (fromMonth === 11 && toYear > fromYear) {
                fromYear++
                fromMonth = -1
            }
        } while (fromMonth++ !== toMonth || fromYear !== toYear)
    }

    const infos: ScheduleEventInfo[] = []
    for await (const date of dateStrings) {
        await navigateToSchedule(pageAndReleaser.page(), date)
        for await (const info of await scrapeSchedule(pageAndReleaser.page(), includeUnpostedEvents, dateRange)) {
            infos.push(info)
        }
    }

    pageAndReleaser.release()
    return infos
}

async function scrapeSchedule(page: Page, includeUnpostedEvents: boolean, dateRange?: DateRange): Promise<ScheduleEventInfo[]> {
    const readEvents: ScheduleEventInfo[] = []

    const eventElements = await page.$$(eventFields)
    for await (const eventElement of eventElements) {
        const result = await eventElement.evaluate((element, dateFrom, dateTo, includeUnpostedEvents) => {
            if (!includeUnpostedEvents && !element.classList.contains("posted")) {
                return
            }

            // Be prepared for everything
            const now = new Date()
            const milleniumOffset = now.getFullYear() - (now.getFullYear() % 1000)

            const dateString = (element as HTMLElement).innerText.split(" ")[1].split("/").map(s => Number(s))
            const date = new Date(milleniumOffset + dateString[2], dateString[1] - 1, dateString[0])
            if (dateFrom && dateTo) {
                const dateFromParsed = new Date(dateFrom)
                const dateToParsed = new Date(dateTo)
                if (!(dateFromParsed <= date && date <= dateToParsed)) {
                    return
                }
            }

            const href = element.getAttribute("href")
            if (href == null) throw new Error("Could not find href on event element")
            const id = href.match("\\d+")
            if (id == null || id.length > 1) {
                throw new Error("Regex matched wrongly for event href")
            } else {
                console.info("Found new event " + id[0])
            }

            let showTemplateId
            element.classList.forEach(className => {
                if (className.startsWith("event_template_")) {
                    showTemplateId = className.split("event_template_")[1]
                }
            })


            return JSON.stringify({id: id[0], showTemplateId: showTemplateId, date: date})
        }, dateRange?.dateFrom, dateRange?.dateTo, includeUnpostedEvents)

        if (result === undefined) continue
        const parsedInfo = JSON.parse(result, (key, value) => {
            if (key === "date") return new Date(value)
            else return value
        })

        await eventElement.click()

        // Wait for the new element to appear
        await page.waitForFunction("document.querySelector(\".actions>.manager\")?.href.includes(" + parsedInfo.id + ")")

        const showTimes = await page.$eval("#eventWindow", (element, date) => {
            const callAndShowTime = (element.querySelectorAll(".subtitle").item(1) as HTMLElement).innerText
            const callIndex = 6
            const callTime = callAndShowTime.substring(callIndex, callIndex + 5)

            // It's showtime
            const showTimeIndex = callAndShowTime.indexOf("Show: ")
            const showTime = callAndShowTime.substring(showTimeIndex + 6).trim()

            const splitTime = [callTime, showTime].map(t => t.split(":")).flat().map(s => Number(s))
            const callTimeDate = new Date(date)
            const showStartDate = new Date(date)
            callTimeDate.setHours(splitTime[0])
            callTimeDate.setMinutes(splitTime[1])

            showStartDate.setHours(splitTime[2])
            showStartDate.setMinutes(splitTime[3])

            return JSON.stringify({callTime: callTimeDate, showStart: showStartDate})
        }, parsedInfo.date)


        const parsedShowTimes = JSON.parse(showTimes, (key, value) => {
            if (key === "callTime" || key === "showStart"){
                return new Date(value)
            } else return value
        })

        readEvents.push(new ScheduleEventInfo(parsedInfo.id, parsedInfo.showTemplateId, parsedShowTimes.callTime, parsedShowTimes.showStart))
    }

    return readEvents
}

async function navigateToSchedule(page: Page, dateString?: string) {
    // Cant be static because the ID is from .env
    const theatreId = needEnvVariable(EnvironmentVariable.THEATRE_ID)
    const SCHEDULE_URL = "https://www.schedgeup.com/theatres/" + theatreId + "/schedule"
    await navigateToUrl(page, dateString == null ? SCHEDULE_URL : SCHEDULE_URL + dateString)
}
