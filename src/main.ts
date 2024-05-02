import {postUrgentDebug, startDiscordClient} from "./discord/discord.js"
import {createTables} from "./database/sqlite.js"
import {setupConfig} from "./common/config.js"
import {setupScraper} from "schedgeup-scraper"
import {setupMailServices} from "./mail/mail.js"
import {inspect} from "node:util"

start().then(() => console.log("Startup finished, use /update in Discord to start update/delete daemon"))

export let EDITION: string
export let STARTING = true

export async function start() {
    EDITION = await findEdition()
    console.log("Starting forestilling-bot...")
    console.log("Edition: " + EDITION)

    // An attempt to log unhandled rejections and errors to discord debug channels
    process.on("unhandledRejection", async error => {
        console.error("Unhandled promise rejection!")
        await postUrgentDebug(inspect(error))
        process.exit(110)
    })

    process.on("uncaughtException", async error => {
        console.error("Uncaught exception!")
        await postUrgentDebug(error.message)
        await postUrgentDebug(inspect(error.cause))
        if (error.stack) await postUrgentDebug(error.stack)

        process.exit(111)
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
