import {Page} from "puppeteer"
import {navigateToUrl} from "../browser.js"
import {EnvironmentVariable, needEnvVariable} from "../../common/config.js"

const LOGIN_URL = "https://www.schedgeup.com/login"

// css selectors

const emailInput = "#session_email"
const passwordInput = "#session_password"
const loginBtn = "input[type=\"submit\"]"

/**
 * @internal
 */
export async function loginSchedgeUp(page: Page) {
    console.log("Starting SchedgeUp login process...")
    await navigateToUrl(page, LOGIN_URL)

    console.log("Entering login info...")
    await page.type(emailInput, needEnvVariable(EnvironmentVariable.SCHEDGEUP_EMAIL))
    await page.type(passwordInput, needEnvVariable(EnvironmentVariable.SCHEDGEUP_PASS))
    console.log("Submitting login info...")
    await page.click(loginBtn)
    console.log("Wait for navigation after login...")
    await page.waitForNavigation()
    if (page.url().includes("login")) {
        throw new Error("Login failed!! :(")
    }
    console.log("Login successful!")
    return page
}
