import {createPage, page, startBrowser} from "./scraper/browser.js"
import {loginSchedgeUp} from "./scraper/pages/login.js"
import {startDiscordClient} from "./discord/discord.js"
import {createTables} from "./database/sqlite.js"
import {setupConfig} from "./common/config.js"
import {version} from "./package.json"

letsGo().then(() => console.log("Ready to rumble, use /update in Discord to finalize startup"))

export async function letsGo() {
    console.log("Starting forestilling-bot version " + version + "...")
    setupConfig()
    await startDiscordClient() // Populates discord client global
    await createPage(await startBrowser()) // Populates page global
    await loginSchedgeUp(page)
    await createTables()
}
