import {startDiscordClient} from "./discord/discord.js"
import {createTables} from "./database/sqlite.js"
import {setupConfig} from "./common/config.js"
import {setupScraper} from "schedgeup-scraper"
import {setupMailServices} from "./mail/mail.js"

start().then(() => console.log("Ready to rumble, use /update in Discord to start update/delete daemon"))

export let EDITION: string
export let STARTING = true

export async function start() {
    EDITION = await findEdition()
    console.log("Starting forestilling-bot...")
    console.log("Edition: " + EDITION)
    process.on("unhandledRejection", error => {
        console.error("Unhandled promise rejection:", error)
    })
    setupConfig()
    await createTables()
    await startDiscordClient() // Populates discord client global
    await setupScraper()
    await setupMailServices()
    STARTING = false
}

/**
 * Execute git command to find latest commit hash and message
 */
async function findEdition(): Promise<string> {
    const exec = (await import("child_process")).exec
    return await new Promise((resolve, reject) => {
        exec("git log -1 --oneline", function (error, stdout, stderr) {
            if (error) {
                reject(stderr)
            } else resolve(stdout)
        })
    }) as string
}
