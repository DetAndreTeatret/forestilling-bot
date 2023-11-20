import {startDiscordClient} from "./discord/discord.js"
import {createTables} from "./database/sqlite.js"
import {setupConfig} from "./common/config.js"
import {fileURLToPath} from "url"
import path from "node:path"
import fs from "node:fs"
import {setupScraper} from "schedgeup-scraper"

letsGo().then(() => console.log("Ready to rumble, use /update in Discord to finalize startup"))

export async function letsGo() {
    console.log("Starting forestilling-bot version " + await findVersion() + "...")
    await setupConfig()
    await startDiscordClient() // Populates discord client global
    await setupScraper()
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
    const pjs = JSON.parse(fs.readFileSync(packagePath).toString()) // TODO import with app-root-path
    return pjs.version
}
