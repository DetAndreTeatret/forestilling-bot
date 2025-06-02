import {createTables} from "./database/sqlite.js"
import {EnvironmentVariable, isDebugEnabled, needEnvVariable, setupConfig} from "./common/config.js"
import {setupScraper} from "schedgeup-scraper"
import {setupMailServices} from "./mail/mail.js"
import {discordClient, startDiscordClient} from "./discord/client.js"
import {update} from "./discord/commands/update.js"
import {ConsoleLogger} from "./common/logging.js"

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

export async function start() {
    EDITION = await findEdition()
    console.log("Starting forestilling-bot...")
    console.log("Edition: " + EDITION)

    // An attempt to log unhandled rejections and errors more effectively
    process.on("unhandledRejection", async error => {
        console.error("Unhandled promise rejection!")
        console.dir(error, {depth: 30})
        process.exit(110)
    })

    process.on("uncaughtException", async error => {
        console.error("Uncaught exception!")
        console.dir(error, {depth: 30})
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
