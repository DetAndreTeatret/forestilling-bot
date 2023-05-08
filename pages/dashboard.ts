import {Page} from "puppeteer";

const DASHBOARD_URL = "https://www.schedgeup.com/users/2080/dashboard"

//css selectors

const exchangeElementClass = ".exchange_bar"
export async function scrapePickups(page: Page) {
    const elements = await page.waitForSelector(exchangeElementClass)
}

export async function navigateToDashboard(page: Page) {
    console.log(`Navigating to ${DASHBOARD_URL}...`)
    await page.goto(DASHBOARD_URL)
}