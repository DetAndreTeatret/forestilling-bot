import puppeteer, {Browser, Page} from "puppeteer"
import {loginSchedgeUp} from "./pages/login.js"
import {Mutex, MutexInterface} from "async-mutex"

let schedgeUpPage: Page | undefined
let browser: Browser

/**
 * @internal
 */
export async function startBrowser() {
    console.log("Starting puppeteer browser...")
    if (browser) await browser.close()
    browser = await puppeteer.launch({
        headless: true,
    })

}

/**
 * @internal
 */
export async function createPage() {
    const page = await browser.newPage()
    // Stop images/css/fonts from loading
    await page.setRequestInterception(true)
    page.on("request", (req) => {
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
    page.on("console", message => {
        if (message.type() === "info" || message.type() === "dir") {
            console.info("[Puppeteer INFO]" + message.text())
        }
    })

    page.on("error",() => {
        mutex.release()
    })

    page.on("pageerror", () => {
        mutex.release()
    })

    // Minimize display size
    await page.setViewport({
        width: 640,
        height: 480,
    })

    page.setDefaultNavigationTimeout(1000 * 60)
    if (schedgeUpPage === undefined) {
        schedgeUpPage = page
        await loginSchedgeUp(schedgeUpPage)
    }
    return page
}

const mutex = new Mutex()

class PageAndReleaser {
    release: MutexInterface.Releaser

    constructor(release: MutexInterface.Releaser) {
        this.release = release
    }

    /**
     * Should not be stored locally, since the page object might change during navigation
     */
    page() {
        if (!schedgeUpPage) throw Error("Page not found")
        // in case the page is reinitialized during navigation retries
        return schedgeUpPage
    }
}

/**
 * @internal
 */
export async function getSchedgeUpPage() {
    if (schedgeUpPage === undefined) {
        throw new Error("SchedgeUp page is not yet initialized...")
    }

    const releaser = await mutex.acquire()
    return new PageAndReleaser(releaser)
}

/**
 * @internal
 */
export async function navigateToUrl(page: Page, url: string, tryCount: number = 0) {
    console.log("Navigating to " + url + "...")
    try {
        await page.goto(url, {waitUntil: "networkidle2"})
    } catch (e) {
        console.log("Page navigation error! Retry " + (tryCount + 1) + "...")
        switch (tryCount) {
            case 0: {
                await navigateToUrl(page, url, 1)
                return
            }
            case 1: {
                await new Promise(resolve => {
                    setTimeout(async () => {
                        await navigateToUrl(page, url, 2)
                        resolve(null)
                    }, 2000)
                })
                return
            }
            case 2: {
                await new Promise(resolve => {
                    setTimeout(async () => {
                        await navigateToUrl(page, url, 3)
                        resolve(null)
                    }, 5000)
                })
                return
            }
            case 3: {
                console.warn("Seems like this page does not work anymore, page is re-initialized!")
                schedgeUpPage = undefined
                mutex.release()
                try {
                    page = await createPage()
                    console.log("Retrying with a new page...")
                    await navigateToUrl(page, url, 4)
                    return
                } catch (e) {
                    console.warn("Uuuuh, error creating page this time. Jump to next try\n" + e)
                    await navigateToUrl(page, url, 4)
                    return
                }
            }
            case 4: {
                console.warn("Ok? Last effort, browser & page is re-initialized!")
                await startBrowser()
                schedgeUpPage = undefined
                page = await createPage()
                console.log("Retrying with a new page...")
                await navigateToUrl(page, url, 5)
                return
            }
        }

        throw new Error("Error with navigating to new page persists after multiple retries... \n" + e)
    }
}
