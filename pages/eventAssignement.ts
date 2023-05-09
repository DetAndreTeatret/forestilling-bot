import {navigateToUrl} from "../main.js";
import {Page} from "puppeteer";

const EVENT_ASSIGN_FORMAT = "https://www.schedgeup.com/assignments/%s/edit"

class Worker {
    role: string
    who: string
    constructor(role: string, who: string) {
        this.role = role;
        this.who = who;
    }
}

class Event {
    id: string
    title: string
    workers: Worker[]

    constructor(id: string, title: string, workers: Worker[]) {
        this.id = id;
        this.title = title;
        this.workers = workers;
    }
}

export async function scrapeEvents(page: Page, ids: string[]) {
    const events: Event[] = []
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const usersSelector = ".assignedUsers"
        console.log("Extracting users from " + id)
        await navigateToUrl(page, EVENT_ASSIGN_FORMAT.replace("%s", id))
        await page.waitForSelector(usersSelector)

        //Fetch the workers currently assigned to this show
        const workers = await page.$$eval(usersSelector, (events) => {

            //Duplicate since browser can not see our class
            class Worker {
                role: string
                who: string
                constructor(role: string, who: string) {
                    this.role = role;
                    this.who = who;
                }
            }

            const workers: Worker[] = []

            events.forEach((element) => {
                const role = element.querySelector(".skilled_role")
                const who = element.querySelector(".bar_info")

                if(role != null && who != null) {
                    workers.push(new Worker(role.innerText.split(" ")[0], who.innerText))
                }
            });

            return JSON.stringify(workers)
        })

        //Fetch the name of this show
        const title: string = await page.$eval("#header", event => {
            //Include spaces in split so there is no space at the end of title text
            return event.querySelector(".subtitle").innerText.split(" • ")[0]
        })

        events.push(new Event(id, title, JSON.parse(workers)))
    }

    return events
}