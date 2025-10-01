import {EnvironmentVariable, needEnvVariable} from "../util/config.js"
import {gmail} from "./mail.js"
import {ConsoleLogger} from "../util/logging.js"


const INTERVAL = 1000 * 60 * 60 * 24 // 24 hours
let daemonRunning = false

const logger = new ConsoleLogger("[MailWatchRequestRefresher.d]")

export function startDaemon() {
    daemonRunning = true

    logger.logLine("Starting mail daemon!(Interval: " + (INTERVAL / 24 / 60 / 60 / 1000) + " days)")
    setTimeout(tickDaemon, INTERVAL)
}

async function tickDaemon() {
    if (!daemonRunning) return

    logger.logLine("Refreshing watch request for mail notifications!")

    await gmail.users.stop({
        userId: "me",
    })

    await gmail.users.watch({
        userId: "me",
        requestBody: {
            topicName: "projects/" + needEnvVariable(EnvironmentVariable.GOOGLE_PROJECT_ID) + "/topics/gmail",
            labelIds: ["INBOX"],
        },
    })

    setTimeout(tickDaemon, INTERVAL)
}

