import {Page} from "puppeteer";

const EVENT_ASSIGN_FORMAT = "https://www.schedgeup.com/assignments/%s/edit"
const EVENT_EDIT_FORMAT = "https://www.schedgeup.com/events/%s/edit"

//css selectors

const eventFields = "[class^='eventBlurb']"
export async function getEvents(page: Page) { //TODO: Add date range("?date=YYYY-MM-DD")
    console.log("Reading all events from schedule page")
    //console.log(await page.content())
    await page.waitForSelector(eventFields)
    return await page.$$eval(eventFields, (events) => {
        const readEvents: Event[] = []
        events.forEach((event) => {
            const href: string = event.href
            const id = href.match("\d+")![0]
            console.log("Found new event " + id)
            readEvents.push(new Event(id))
        })

        return readEvents
    })
}

export async function navigateToSchedule(page: Page) {
    //Cant be static because the ID is from .env
    const SCHEDULE_URL = `https://www.schedgeup.com/theatre/${process.env["THEATRE_ID"]!}/schedule`
    console.log(`Navigating to ${SCHEDULE_URL}...`)
    await page.goto(SCHEDULE_URL)
}

export class Event {
    id: string

    constructor(id: string) {
        this.id = id
    }

    public getAssignmentNavigationLink() {
        return EVENT_ASSIGN_FORMAT.replace("%s", this.id)
    }

    public getEditNavigationLink() {
        return EVENT_EDIT_FORMAT.replace("%s", String(this.id))
    }
}