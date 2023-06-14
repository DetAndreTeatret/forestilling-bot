//Login the given Browser to SchedgeUp through the standard login url

import {navigateToUrl} from "../browser.js";
import {Page} from 'puppeteer'

const LOGIN_URL = "https://www.schedgeup.com/login"

// css selectors

const emailInput = "#session_email"
const passwordInput = "#session_password"
const loginBtn = "input[type=\"submit\"]"
export async function loginSchedgeUp(page: Page) {
    console.log("Starting login process...")
    await navigateToUrl(page, LOGIN_URL)

    console.log("Entering login info...")
    const schedgeUpEmail = process.env["SCHEDGEUP_EMAIL"]
    const schedgeUpPassword = process.env["SCHEDGEUP_PASS"]
    await page.type(emailInput, schedgeUpEmail)
    await page.type(passwordInput, schedgeUpPassword)
    console.log("Submitting login info...")
    await page.click(loginBtn)
    console.log("Wait for navigation after login...")
    await page.waitForNavigation()
    console.log("Login successful!")
    return page
}