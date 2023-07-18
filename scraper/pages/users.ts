import {navigateToUrl} from "../browser.js";
import {Page} from "puppeteer";
import {SchedgeUpUser} from "../../database/user.js";
import {EnvironmentVariable, needEnvVariable} from "../../common/config.js";

export async function scrapeUsers(page: Page): Promise<SchedgeUpUser[]> {
    await navigateToUsers(page)

    return JSON.parse(await page.$eval(".infoTable", (result) => {

        const users: SchedgeUpUser[] = []

        class SchedgeUpUser {
            userId: string
            displayName: string
            roles: string[]
            groups: string[]

            constructor(userId: string, displayName: string, roles: string[], groups: string[]) {
                this.userId = userId;
                this.displayName = displayName;
                this.roles = roles;
                this.groups = groups;
            }
        }

        /**
         * A user row should consist of these 8 data cell elements(<td>)("contains" implies element.innerText):
         * 0. Cell containing only the row number of the current user row
         * 1. Cell containing only the display name of the user
         * 2. Cell containing an element that contains the telephone number of the user, if any exists
         * 3. Cell containing an element that contains the mail address of the user
         * 4. Cell containing an element that contains a calendar icon, which has a href to the schedule for the given user
         * 5. Cell containing an element that contains a birthday cake icon, which has a href to the page of all theatre birthdays
         * 6. Cell containing an element that contains a camera icon, which has a href to the affiliations page of the user
         * 7. Cell containing an element that contains a pencil icon, which has a href to the affiliations page of the user
         * @param element
         */
        function parseUser(element: Element) {
            const cells = element.children

            const displayName = (needNotNull(cells.item(1), "user td 1") as HTMLElement).innerText

            //@ts-ignore
            const id = needNotNull(cells.item(4), "user td 4").firstChild.href.split("=")[1]

            return new SchedgeUpUser(id, displayName, [], []) //TODO: Roles and groups
        }

        function needNotNull<T>(object: T | null, whatIsTheObject: string) {
            if (object == null) {
                throw new Error("object needs to be not null and is in fact, null: " + whatIsTheObject)
            }

            return object
        }

        const tableBody = result.children.item(0)
        if (tableBody == null) {
            throw new Error("Illegal state, table body was not found")
        }

        console.info("Found " + tableBody.children.length + " users, parsing...")
        for (let i = 0; i < tableBody.children.length; i++) {
            const tableItem = tableBody.children.item(i)
            if (tableItem == null) {
                throw new Error("Illegal state, the for loop in JavaScript is broken...")
            }

            const user = parseUser(tableItem)
            console.info("Found user " + user.displayName + "(" + user.userId + ")")
            users.push(user)
        }

        return JSON.stringify(users)
    }))
}


async function navigateToUsers(page: Page) {
    //Cant be static because the ID is from .env
    const theatreId = needEnvVariable(EnvironmentVariable.THEATRE_ID) //TODO: check that env variables are present before coming this far
    const usersUrl = "https://www.schedgeup.com/theatre/" + theatreId + "/users"
    await navigateToUrl(page, usersUrl)
}