import {startDiscordClient} from "./discord/discord.js"
import {createTables} from "./database/sqlite.js"
import {setupConfig} from "./common/config.js"
import {fileURLToPath} from "url"
import path from "node:path"
import fs from "node:fs"
import {setupScraper} from "schedgeup-scraper"

start().then(() => console.log("Ready to rumble, use /update in Discord to finalize startup"))

export let VERSION: string

export async function start() {
    VERSION = await findVersion()
    console.log("Starting forestilling-bot version " + VERSION + "...")
    process.on("unhandledRejection", error => {
        console.error("Unhandled promise rejection:", error)
    })
    setupConfig()
    await startDiscordClient() // Populates discord client global
    await setupScraper()
    await createTables()
}

/**
 * Hacky solution to find package.json after build...
 */
async function findVersion(): Promise<string> {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const packagePath = __dirname.replace("build", "package.json")
    // importing gives assertion errors...
    const pjs = JSON.parse(fs.readFileSync(packagePath).toString())
    return pjs.version
}
