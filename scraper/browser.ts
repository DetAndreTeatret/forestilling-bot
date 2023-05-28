import puppeteer, {Browser, Page} from 'puppeteer'

export async function startBrowser() {
    console.log("Starting browser...")
    return puppeteer.launch({
        headless: true,
        args: ['--disable-setuid-sandbox'],
        ignoreHTTPSErrors: true,
        //DISPLAY: ':10.0',
    })
}

export async function createPage(browser: Browser) {
    const page = await browser.newPage()
    // Stop images/css/fonts from loading
    await page.setRequestInterception(true)
    page.on('request', (req) => {
        if (
            req.resourceType() === 'image' ||
            req.resourceType() === 'font' ||
            req.resourceType() === 'stylesheet'
        ) {
            req.abort()
        } else {
            req.continue()
        }
    })

    //Forward relevant console info from browser console to node console
    page.on('console', message => {
        if(message.type() == "info") {
            console.info("[Puppeteer INFO]" + message.text())
        }
    })

    //Minimize display size
    await page.setViewport({
        width: 640,
        height: 480,
    })

    return page
}

export async function navigateToUrl(page: Page, url: string) {
    console.log("Navigating to " + url + "...")
    await page.goto(url, {waitUntil: "networkidle2"})
}
