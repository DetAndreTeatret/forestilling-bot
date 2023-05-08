import {createPage, startBrowser} from "./browser.js";
import {login} from "./pages/login.js";
import {getEventIds, navigateToSchedule} from "./pages/schedule.js";
import dotenv from 'dotenv'
import {Page} from "puppeteer";

dotenv.config()

const EVENT_ASSIGN_FORMAT = "https://www.schedgeup.com/assignments/%s/edit"
const EVENT_EDIT_FORMAT = "https://www.schedgeup.com/events/%s/edit"

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

const browser = await startBrowser()
const page= await createPage(browser)

await login(page)

await navigateToSchedule(page)
const ids = await getEventIds(page)

const events: Event[] = [] //TODO: Move into eventAssignements.ts
for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const usersSelector = ".assignedUsers"
    console.log("Extracting users from " + id)
    await navigateToUrl(page, EVENT_ASSIGN_FORMAT.replace("%s", id))
    await page.waitForSelector(usersSelector)
    const workers = await page.$$eval(usersSelector, (events) => {
        class Worker { //Duplicate since browser can not see our class
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

    const title: string = await page.$eval("#header", event => {
        //Include spaces in split so there is no space at the end of title text
        return event.querySelector(".subtitle").innerText.split(" • ")[0]
    })

    events.push(new Event(id, title, JSON.parse(workers)))
}

console.log(JSON.stringify(events, null, 1))
process.exit()


export async function navigateToUrl(page: Page, url: string) {
    console.log("Navigating to " + url + "...")
    await page.goto(url, {waitUntil: "networkidle2"})
}