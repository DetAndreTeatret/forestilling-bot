import {createTables} from "./database/sqlite.js"
import {EnvironmentVariable, isDebugEnabled, needEnvVariable, setupConfig} from "./util/config.js"
import {setupScraper} from "schedgeup-scraper"
import {setupMailServices} from "./mail/mail.js"
import {discordClient, startDiscordClient} from "./discord/client.js"
import {update} from "./discord/commands/update.js"
import {ConsoleLogger} from "./util/logging.js"
import {setupMessageQueue, shutdownMessages} from "./util/announcementNaggingMessageQueue.js"

start().then(() => {
    if (isDebugEnabled()) {
        console.log("[Debug] Startup finished, use /update in Discord to start update/delete daemon")
    } else {
        console.log("Startup finished, starting first update...")
        discordClient.guilds.fetch(needEnvVariable(EnvironmentVariable.GUILD_ID))
            .then(guild => {
                update(guild, new ConsoleLogger("[FirstUpdate]"))
                    .then(() => console.log("Finished first update and startup of update/delete daemon"))
            })
    }
})

export let EDITION: string
export let STARTING = true

async function start() {
    EDITION = await findEdition()
    console.log("Starting forestilling-bot...")
    console.log("Edition: " + EDITION)

    setupConfig()
    await createTables()
    await startDiscordClient() // Populates discord client global
    await setupScraper()
    await setupMailServices()
    setupMessageQueue()
    STARTING = false
}

async function stop(code: number, signal?: string) {
    if (signal) console.warn("Received signal " + signal)
    console.log("Stopping forestilling-bot...")
    await shutdownMessages()
    process.exit(code)
}

// An attempt to log unhandled rejections and errors more effectively
process.on("unhandledRejection", async error => {
    console.error("Unhandled promise rejection!")
    console.dir(error, {depth: 30})
    stop(110)
})

process.on("uncaughtException", async error => {
    console.error("Uncaught exception!")
    console.dir(error, {depth: 30})
    stop(111)
})

// Handle termination as gracefully as possible
process.on("SIGINT", ()  => stop(0, "SIGINT"))
process.on("SIGTERM", () => stop(0, "SIGTERM"))

/**
 * Execute git command to find the latest commit hash and message
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
