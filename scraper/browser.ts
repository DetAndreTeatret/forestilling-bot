import puppeteer, {Browser, Page} from "puppeteer"

export let page: Page

export async function startBrowser() {
    console.log("Starting puppeteer browser...")
    return puppeteer.launch({
        headless: true,
        args: ["--disable-setuid-sandbox"],
        ignoreHTTPSErrors: true,
        // DISPLAY: ':10.0',
    })

}

export async function createPage(browser: Browser) {
    const page0 = await browser.newPage()
    // Stop images/css/fonts from loading
    await page0.setRequestInterception(true)
    page0.on("request", (req) => {
        if (
            req.resourceType() === "image" ||
            req.resourceType() === "font" ||
            req.resourceType() === "stylesheet"
        ) {
            req.abort()
        } else {
            req.continue()
        }
    })

    // Forward relevant console info from browser console to node console
    page0.on("console", message => {
        if(message.type() === "info") {
            console.info("[Puppeteer INFO]" + message.text())
        }
    })

    // Minimize display size
    await page0.setViewport({
        width: 640,
        height: 480,
    })

    page0.setDefaultNavigationTimeout(1000 * 60)

    page = page0
    return page0
}

export async function navigateToUrl(page: Page, url: string, tryCount?: number) {
    console.log("Navigating to " + url + "...")
    try {
        await page.goto(url, {waitUntil: "networkidle2"})
    } catch (e) {
        console.log("Error while trying to navigate to " + url + ": " + e)
        const currentTry = tryCount === undefined ? 0 : tryCount
        if(currentTry > 3) {
            throw new Error("Failed to navigate to url " + url + " after 3 retries :(")
        }
        console.log("Retrying...(" + tryCount + "/3)")
        await navigateToUrl(page, url, currentTry + 1)
    }
}
