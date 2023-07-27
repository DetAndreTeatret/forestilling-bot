import {Page} from "puppeteer"
import {navigateToUrl} from "../browser.js"

const EVENT_ASSIGN_FORMAT = "https://www.schedgeup.com/assignments/%s/edit"

export class Worker {
    id: string | null // null if Guest
    role: string
    who: string
    constructor(id: string | null, role: string, who: string) {
        this.id = id
        this.role = role
        this.who = who
    }
}

export class Event {
    id: string
    title: string
    workers: Worker[]
    showTemplateId: string | undefined

    constructor(id: string, title: string, workers: Worker[], showTemplateId: string | undefined) {
        this.id = id
        this.title = title
        this.workers = workers
        this.showTemplateId = showTemplateId
    }
}

export async function scrapeEvents(page: Page, ids: [string, string | undefined][]) {
    const events: Event[] = []
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i][0]
        const usersSelector = ".assignedUsers"
        console.log("Extracting users from " + id)
        await navigateToUrl(page, EVENT_ASSIGN_FORMAT.replace("%s", id))

        // Fetch the workers currently assigned to this show
        const workers = await page.$$eval(usersSelector, (events) => {

            // Duplicate since browser can not see our class
            class Worker {
                id: string | null // null if Guest
                role: string
                who: string
                constructor(id: string | null, role: string, who: string) {
                    this.id = id
                    this.role = role
                    this.who = who
                }
            }

            const workers: Worker[] = []

            events.forEach((element) => {
                const role = element.querySelector(".skilled_role") as HTMLElement
                const whoList = element.querySelectorAll(".userBar")

                if(role != null && whoList.length > 0) {
                    whoList.forEach(whoListElement => {
                        const id = whoListElement.getAttribute("data-id")
                        const who = whoListElement.querySelector(".bar_info") as HTMLElement
                        if(who != null) {
                            workers.push(new Worker(id, role.innerText.split(" ")[0], who.innerText))
                        }
                    })
                }
            })

            return JSON.stringify(workers)
        })

        // Fetch the name of this show
        const title: string = await page.$eval("#header", event => {
            // Include spaces in split so there is no space at the end of title text
            const subtitle = event.querySelector(".subtitle") as HTMLElement
            return subtitle == null ? "null" : subtitle.innerText.split(" • ")[0]
        })

        events.push(new Event(id, title, JSON.parse(workers), ids[i][1]))
    }

    return events
}
