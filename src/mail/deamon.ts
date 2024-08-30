import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {gmail} from "./mail.js"


const INTERVAL = 1000 * 60 * 60 * 24 // 24 hours
let daemonRunning = false

export function startDaemon() {
    daemonRunning = true

    console.log("Starting mail daemon!(Interval: " + (INTERVAL / 24 / 60 / 60 / 1000) + " days)")
    setTimeout(tickDaemon, INTERVAL)
}

async function tickDaemon() {
    if (!daemonRunning) return

    console.log("Refreshing watch request for mail notifications!")

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

