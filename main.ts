import {createPage, page, startBrowser} from "./scraper/browser.js"
import {loginSchedgeUp} from "./scraper/pages/login.js"
import {startDiscordClient} from "./discord/discord.js"
import {createTables} from "./database/sqlite.js"
import {setupConfig} from "./common/config.js"
import {fileURLToPath} from "url"
import path from "node:path"
import fs from "node:fs"

letsGo().then(() => console.log("Ready to rumble, use /update in Discord to finalize startup"))

export async function letsGo() {
    console.log("Starting forestilling-bot version " + await findVersion() + "...")
    setupConfig()
    await startDiscordClient() // Populates discord client global
    await createPage(await startBrowser()) // Populates page global
    await loginSchedgeUp(page)
    await createTables()
}

/**
 * Hacky solution to find package.json after build...
 */
async function findVersion() {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const packagePath = __dirname.replace("build", "package.json")
    // importing gives assertion errors...
    const pjs = JSON.parse(fs.readFileSync(packagePath).toString())
    return pjs.version
}
