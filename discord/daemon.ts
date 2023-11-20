import {Guild} from "discord.js"
import {update} from "./commands/update.js"
import {fetchSetting, updateSetting} from "../database/settings.js"
import {Logger} from "../common/logging.js"
import {checkDeletions} from "./commands/delete.js"

const ONE_HOUR_MILLISECONDS = 1000 * 60 * 60

export type StringConsumer = (string: string) => Promise<void> // TODO move to logger

let daemonRunning = false
let interval: number
export async function startDaemon() {
    if(daemonRunning) return
    daemonRunning = true
    let parsedInterval = await fetchSetting("daemon-interval") // Stored in ms
    if(parsedInterval === undefined) {
        const duration = String(ONE_HOUR_MILLISECONDS)
        await updateSetting("daemon-interval", duration)
        parsedInterval = duration
    }
    interval = Number(parsedInterval)
    console.info("Starting deletion daemon!(Interval: " + (interval / 1000 / 60) + " minutes)")

    setTimeout(tickDaemon, interval)
}

const guildsToUpdate: Guild[] = []

export function addGuildToUpdate(guild: Guild) {
    if(!guildsToUpdate.includes(guild)) guildsToUpdate.push(guild)
}

async function tickDaemon() {
    for await (const guild of guildsToUpdate) {
        try {
            await update(guild, new Logger(async log => console.log("[update.d] " + log)))
        } catch (error) {
            await console.error("Encountered error during update: " + error)
            throw error
        }
        await checkDeletions(new Logger(async (log) => console.log("[delete.d] " + log)))
    }

    if(daemonRunning) {
        setTimeout(tickDaemon, interval)
    }
}
