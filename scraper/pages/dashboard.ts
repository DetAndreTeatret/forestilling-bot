import {Page} from "puppeteer"

const DASHBOARD_URL_FORMAT = "https://www.schedgeup.com/users/%s/dashboard"

//css selectors

const exchangeElementClass = ".exchange_bar"
export async function scrapePickups(page: Page) {
    const elements = await page.waitForSelector(exchangeElementClass)
}

export async function navigateToDashboard(page: Page) {
    console.log(`Navigating to ${DASHBOARD_URL_FORMAT}...`)
    await page.goto(DASHBOARD_URL_FORMAT)
}