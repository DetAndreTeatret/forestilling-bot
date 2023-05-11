//Login the given Browser to SchedgeUp through the standard login url

import {createPage} from "../browser.js";
import {Browser, Page} from 'puppeteer'
import {navigateToUrl} from "../main.js";

const LOGIN_URL = "https://www.schedgeup.com/login"

// css selectors

const emailInput = "#session_email"
const passwordInput = "#session_password"
const loginBtn = "input[type=\"submit\"]"
export async function login(page: Page) {
    console.log("Starting login process...")
    await navigateToUrl(page, LOGIN_URL)

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