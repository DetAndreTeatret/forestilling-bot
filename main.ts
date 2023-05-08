import {startBrowser} from "./browser.js";
import {login} from "./pages/login.js";
import {getEvents, navigateToSchedule, Event} from "./pages/schedule.js";
import dotenv from 'dotenv'
import {Page} from "puppeteer";

dotenv.config()

const browser = await startBrowser()

const page = await login(browser)
await navigateToSchedule(page)
const events = await getEvents(page)

console.log("Extracting users from events!")
for (let i = 0; i < events.length; i++) {
    const event = events[0]
    console.log("Extracting from " + event.id)
    await navigateToUrl(page, event.getAssignmentNavigationLink())
    await page.waitForSelector(".assignedUsers")
    await page.$$eval(".assignedUsers", (events) => {
        events.forEach(element => {
            const role = element.querySelector(".skilled_role").textContent
            const who = element.querySelector(".bar_info").textContent

            console.log("Found user " + who + " which is doing " + role + " in show " + event.id)
        });

    })
    if(i > 5) { //wip
        console.log("Finished... Goodbye!")
        process.exit()
    }
}
console.log("No users found :(")
process.exit()



async function navigateToUrl(page: Page, url: string) {
    console.log("Navigating to " + url + "...")
    await page.goto(url)
}