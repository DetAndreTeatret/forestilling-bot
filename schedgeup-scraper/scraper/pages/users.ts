import {Page} from "puppeteer"
import {getSchedgeUpPage, navigateToUrl} from "../browser.js"
import {EnvironmentVariable, getEnvVariable, needEnvVariable} from "../../common/config.js"
import {AsYouType, CountryCode, isValidPhoneNumber} from "libphonenumber-js"

class SchedgeUpUser {
    userId: string
    displayName: string
    roles: string[]
    groups: string[]
    phoneNumber: string | null
    emailAddress: string

    constructor(userId: string, displayName: string, roles: string[], groups: string[], phoneNumber: string | null, emailAddress: string) {
        this.userId = userId
        this.displayName = displayName
        this.roles = roles
        this.groups = groups
        this.phoneNumber = phoneNumber
        this.emailAddress = emailAddress
    }
}

/**
 * Scrape users from the "All Users" page, alternatively pass an array of user ids to include to discard any unnecessary users
 * @param users user ids to include in the result, will ignore all users not included in this array if present
 */
export async function scrapeUsers(users?: string[]): Promise<SchedgeUpUser[]> {
    const pageAndReleaser = await getSchedgeUpPage()
    await navigateToUsers(pageAndReleaser.page())

    const pages = await pageAndReleaser.page().$("div.pages")
    if (!pages) throw new Error("Could not find pages div")

    const pagesAmount = await pages.evaluate(el => el.children.length)
    const schedgeUpUsers: SchedgeUpUser[] = []

    for (let i = 0; i < pagesAmount; i++) {
        // Only switch page if not parsing the very first page (we're already on that one)
        if (i !== 0) {
            await navigateToUsers(pageAndReleaser.page(), i + 1)
        }


        schedgeUpUsers.push(...JSON.parse(await pageAndReleaser.page().$eval("table.infoTable", (result, userIds) => {

                const users: SchedgeUpUser[] = []

                class SchedgeUpUser {
                    userId: string
                    displayName: string
                    roles: string[]
                    groups: string[]
                    phoneNumber: string
                    emailAddress: string

                    constructor(userId: string, displayName: string, roles: string[], groups: string[], phoneNumber: string, emailAddress: string) {
                        this.userId = userId
                        this.displayName = displayName
                        this.roles = roles
                        this.groups = groups
                        this.phoneNumber = phoneNumber
                        this.emailAddress = emailAddress
                    }
                }

                /**
                 * A user row should consist of these 8 data cell elements(<td>)("contains" implies element.innerText):
                 * 0. Cell containing only the row number of the current user row
                 * 1. Cell containing only the display name of the user
                 * 2. Cell containing an element that contains the telephone number of the user, if any exists(empty returns "")
                 * 3. Cell containing an element that contains the mail address of the user
                 * 4. Cell containing only the birthday month and day of the user, e.g "Aug 9"
                 * 5. Cell containing an icon check symbol if the user has added a photo of themselves, if not it is empty
                 * 6. Cell containing a number of how many ensembles they are a member off
                 * 7. Cell containing a button showing a drop down menu on press, with the option to see their schedule or edit the user
                 * @param element user element as described above
                 */
                function parseUser(element: Element) {
                    const cells = element.children

                    const displayName = (needNotNull(cells.item(1), "user td 1") as HTMLElement).innerText

                    const idElement = needNotNull(cells.item(7), "user td 6")
                    const id = needNotNull(findAnchorByHrefpart(idElement, "assignments?user_id="), "user id from schedule dropdown").href.split("=")[1]


                    if (userIds !== undefined && !userIds.includes(id)) return null
                    // @ts-ignore
                    const phoneNumber = needNotNull(cells.item(2), "user td 2").firstChild.innerText
                    // @ts-ignore
                    const emailAddress = needNotNull(cells.item(3), "user td 2").firstChild.innerText

                    return new SchedgeUpUser(id, displayName, [], [], phoneNumber === "" ? "undefined" : phoneNumber, emailAddress) // TODO: Roles and groups
                }

                function needNotNull<T>(object: T | null, whatIsTheObject: string) {
                    if (object == null) {
                        throw new Error("object needs to be not null and is in fact, null: " + whatIsTheObject)
                    }

                    return object
                }

                /**
                 * Finds the first anchor element with a specific href attribute within the children of a parent element.
                 * @param parent The parent DOM element to search within.
                 * @param hrefPart The href attribute value to match.
                 * @returns The first matching anchor element, or `null` if not found.
                 */
                function findAnchorByHrefpart(parent: Element, hrefPart: string): HTMLAnchorElement | null {
                    if (
                        parent.tagName === "A" &&
                        parent instanceof HTMLAnchorElement &&
                        parent.href.includes(hrefPart)
                    ) {
                        return parent
                    }

                    // Recursively search all children
                    for (let i = 0; i < parent.children.length; i++) {
                        const child = parent.children.item(i)
                        if (!child) continue
                        const result = findAnchorByHrefpart(child, hrefPart)
                        if (result) {
                            return result
                        }
                    }

                    return null
                }

                const tableBody = result.children.item(0)
                if (tableBody == null) {
                    throw new Error("Illegal state, table body was not found")
                }

                // The first element of the table is the titles of each column
                console.info("Found " + (tableBody.children.length - 1) + " users, parsing...")
                for (let i = 1; i < tableBody.children.length; i++) {
                    const tableItem = tableBody.children.item(i)
                    if (tableItem == null) {
                        throw new Error("Illegal state, the for loop in JavaScript is broken...")
                    }

                    const user = parseUser(tableItem)
                    if (!user) continue
                    console.info("Found user " + user.displayName + "(" + user.userId + ")")
                    users.push(user)
                }

                return JSON.stringify(users)
            }, users), (key, value) => {
                if (key === "phoneNumber") {
                    if (value === "undefined") return null
                    const sanitizedNumber = value.replace(new RegExp("[^+0-9]", "g"), "").replace(" ", "").trim()
                    const countryCode = getEnvVariable("NATIVE_COUNTRY_CODE", "NO") as CountryCode
                    if (isValidPhoneNumber(sanitizedNumber, countryCode)) {
                        // If there was found any weird symbols on numbers matching our country, its probably a mistake
                        return new AsYouType().input(sanitizedNumber)
                    } else if (isValidPhoneNumber("+" + sanitizedNumber, countryCode)) {
                        // If there was found any weird symbols on a number starting with our country code, it's probably a mistake
                        return new AsYouType().input("+" + sanitizedNumber)
                    } else {
                        // If the number is not a valid number for our country, we have to believe that the user typed in the correct symbols
                        return new AsYouType().input(value)
                    }
                } else return value
            })
            )
    }

    pageAndReleaser.release()
    return schedgeUpUsers
}


async function navigateToUsers(page: Page, pageSegment?: number) {
    // Cant be static because the ID is from .env
    const theatreId = needEnvVariable(EnvironmentVariable.THEATRE_ID)
    const usersUrl = "https://www.schedgeup.com/theatres/" + theatreId + "/users" + (pageSegment ? "?page=" + pageSegment : "")
    await navigateToUrl(page, usersUrl)
}
