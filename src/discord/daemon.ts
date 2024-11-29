import {Guild} from "discord.js"
import {update} from "./commands/update.js"
import {fetchSetting, updateSetting} from "../database/settings.js"
import {ConsoleLogger} from "../common/logging.js"
import {checkDeletions} from "./commands/delete.js"
import {postUrgentDebug} from "./client.js"

const ONE_HOUR_MILLISECONDS = 1000 * 60 * 60

let daemonRunning = false
let interval: number

const daemonLogger = new ConsoleLogger("[DiscordUpdate.d]")

export async function startDaemon() {
    if (daemonRunning) return

    // If the first update was just ran, we want to run a deletion as well
    await checkDeletions(daemonLogger)

    daemonRunning = true
    let parsedInterval = await fetchSetting("daemon-interval") // Stored in ms
    if (parsedInterval === undefined) {
        const duration = String(ONE_HOUR_MILLISECONDS)
        await updateSetting("daemon-interval", duration)
        parsedInterval = duration
    }
    interval = Number(parsedInterval)
    daemonLogger.logLine("Starting update/delete daemon!(Interval: " + (interval / 1000 / 60) + " minutes)")

    setTimeout(tickDaemon, interval)
}

const guildsToUpdate: Guild[] = []

export function addGuildToUpdate(guild: Guild) {
    if (!guildsToUpdate.includes(guild)) guildsToUpdate.push(guild)
}

async function tickDaemon() {
    for await (const guild of guildsToUpdate) {
        try {
            await update(guild, daemonLogger)
        } catch (error) {
            console.error(error)
            await postUrgentDebug("Encountered error during update " + error)
        }
        await checkDeletions(daemonLogger)
    }

    if (daemonRunning) {
        setTimeout(tickDaemon, interval)
    }
}
