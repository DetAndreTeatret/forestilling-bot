import {getSchedgeUpPage, navigateToUrl} from "../browser.js"
import {ScheduleEventInfo} from "./schedule.js"

const EVENT_ASSIGN_FORMAT = "https://www.schedgeup.com/assignments/%s/edit"

export class Worker {
    id: string | null // null if Guest
    role: string
    who: string
    secondaryRole: string | null

    constructor(id: string | null, role: string, who: string, secondaryRole: string | null) {
        this.id = id
        this.role = role
        this.who = who
        this.secondaryRole = secondaryRole
    }
}

export class Event {
    id: string
    title: string
    subtitle: string | undefined
    workers: Worker[]
    showTemplateId: string | undefined
    eventCallTime: Date
    eventStartTime: Date
    eventEndTime: Date

    constructor(id: string, title: string, subtitle: string | undefined, workers: Worker[], showTemplateId: string | undefined, eventCallTime: Date, eventStartTime: Date, eventEndTime: Date) {
        this.id = id
        this.title = title
        this.subtitle = subtitle
        this.workers = workers
        this.showTemplateId = showTemplateId
        this.eventCallTime = eventCallTime
        this.eventStartTime = eventStartTime
        this.eventEndTime = eventEndTime
    }
}

export async function scrapeEvents(eventInfos: ScheduleEventInfo[]) {
    const pageAndReleaser = await getSchedgeUpPage()
    const events: Event[] = []
    for (let i = 0; i < eventInfos.length; i++) {
        const id = eventInfos[i].id
        const usersSelector = ".assignedUsers"
        console.log("Extracting users from " + id)
        await navigateToUrl(pageAndReleaser.page(), EVENT_ASSIGN_FORMAT.replace("%s", id))

        // Fetch the workers currently assigned to this show
        const workers = JSON.parse(await pageAndReleaser.page().$$eval(usersSelector, (events) => {

            // Duplicate since browser can not see our class
            class Worker {
                id: string | null // null if Guest
                role: string
                who: string
                secondaryRole: string | null

                constructor(id: string | null, role: string, who: string, secondaryRole: string | null) {
                    this.id = id
                    this.role = role
                    this.who = who
                    this.secondaryRole = secondaryRole
                }
            }

            const workers: Worker[] = []

            events.forEach((element) => {
                const role = element.getElementsByTagName("LABEL")[0] as HTMLElement
                const whoList = element.querySelectorAll(".userBar")

                if (role != null && whoList.length > 0) {
                    whoList.forEach(whoListElement => {
                        const id = whoListElement.getAttribute("data-id")
                        const who = whoListElement.querySelector(".bar_info") as HTMLElement
                        if (who != null) {
                            const name = who.firstChild?.textContent?.replaceAll("\n", "")
                            // Regex is to remove the appended (0)/(1) etc.. (The required amount of users in SU)
                            const roleTrimmed = role.innerText.replace(new RegExp("\\(\\d+\\)"), "").trim()

                            const secondaryRoleMaybe = who.nextElementSibling
                            let secondaryRole: string | null = null
                            if (secondaryRoleMaybe && secondaryRoleMaybe.nodeName === "SPAN") secondaryRole = secondaryRoleMaybe.textContent
                            workers.push(new Worker(id, roleTrimmed, name == null ? "MissingName" : name.trim(), secondaryRole))
                        } else {
                            // Guests
                            const who = whoListElement.querySelector(".assignmentFields")
                            if (who === null) throw new Error("Error trying to read user assignment entry")
                            const whoTextElement = who.querySelector("[type=\"text\"]")
                            if (whoTextElement === null) throw new Error("Could not find text element in Guest entry")
                            const whoText = whoTextElement.getAttribute("value")
                            if (whoText === null) throw new Error("Could not find text content in text element in Guest entry")

                            workers.push(new Worker(id, role.innerText.split(" ")[0], whoText, null))
                        }
                    })
                }
            })

            return JSON.stringify(workers)
        }))

        class MoreEventInfo {
            title: string
            subtitle: string | undefined
            eventStartTime: Date
            eventEndTime: Date

            constructor(title: string, subtitle: string | null | undefined, eventStartTime: Date, eventEndTime: Date) {
                this.title = title
                if (subtitle === null) {
                    this.subtitle = undefined
                }  else {
                    this.subtitle = subtitle
                }
                this.eventStartTime = eventStartTime
                this.eventEndTime = eventEndTime
            }
        }

        // Fetch the name of this show
        const moreInfo: MoreEventInfo = JSON.parse(await pageAndReleaser.page().$eval(".assign > .formHeader", (element, eventDate) => {
            const nodes = element.querySelectorAll(".subtitle")

            const title = element.firstElementChild?.firstElementChild?.textContent
            const subtitle: string | null | undefined = nodes.item(0).firstChild?.textContent
            const eventLengthText = nodes.item(1).textContent?.split(" • ")[1]

            if (title === null || title === undefined || eventLengthText === undefined) {
                throw new Error("Error fetching title or eventLength from " + (title === null ? "some event" : title))
            }

            const eventLengthPieces = eventLengthText.split(new RegExp("[:|-]"))
            const fromHours = Number(eventLengthPieces[0])
            const fromMinutes = Number(eventLengthPieces[1])
            const toHours = Number(eventLengthPieces[2])
            const toMinutes = Number(eventLengthPieces[3])

            const eventDateParsed = new Date(eventDate) // TODO look for date on page? So id is the only thing needed for fetch
            const eventStartTime = new Date(eventDateParsed.getFullYear(), eventDateParsed.getMonth(), eventDateParsed.getDate(), fromHours, fromMinutes)
            const eventEndTime = new Date(eventDateParsed.getFullYear(), eventDateParsed.getMonth(), eventDateParsed.getDate(), toHours, toMinutes)

            return JSON.stringify({
                title: title.trim().replace("\n", ""),
                subtitle: subtitle,
                eventStartTime: eventStartTime,
                eventEndTime: eventEndTime
            })
        }, eventInfos[i].eventStartTime), (key, value) => {
                if (key === "eventStartTime" || key === "eventEndTime") {
                    return new Date(value)
                } else return value
            })

        events.push(new Event(id, moreInfo.title, moreInfo.subtitle, workers, eventInfos[i].showtemplateId, eventInfos[i].eventCallTime, moreInfo.eventStartTime, moreInfo.eventEndTime))
    }

    pageAndReleaser.release()
    return events
}
