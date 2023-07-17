import {createPage, startBrowser} from "./scraper/browser.js";
import {loginSchedgeUp} from "./scraper/pages/login.js";
import {startDiscordClient, SuperClient} from "./discord/discord.js";
import dotenv from "dotenv";
import {Page} from "puppeteer";
import {createTables} from "./database/sqlite.js";

dotenv.config()
letsGo().then(() => console.log("Ready to rumble"))

export let discordClient: SuperClient
export let page: Page

export async function letsGo() {
    discordClient = await startDiscordClient()
    page = await createPage(await startBrowser())
    await loginSchedgeUp(page)
    await createTables()
}
