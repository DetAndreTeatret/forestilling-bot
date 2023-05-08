//Login the given Browser to SchedgeUp through the standard login url

import {createPage} from "../browser.js";
import {Browser} from 'puppeteer'

const LOGIN_URL = "https://www.schedgeup.com/login"

// css selectors

const emailInput = "#session_email"
const passwordInput = "#session_password"
const loginBtn = "input[type=\"submit\"]"
export async function login(browser: Browser) {
    console.log("Starting login process...")
    const page = await createPage(browser)

    console.log(`Navigating to ${LOGIN_URL}...`)
    await page.goto(LOGIN_URL)

    await page.waitForSelector(emailInput)
    console.log("Entering login info...")
    await page.type(emailInput, process.env["SCHEDGEUP_EMAIL"]!)
    await page.type(passwordInput, process.env["SCHEDGEUP_PASS"]!)
    console.log("Submitting login info...")
    await page.click(loginBtn)
    console.log("Wait for navigation after login...")
    await page.waitForNavigation()
    console.log("Login successful!")
    return page
}