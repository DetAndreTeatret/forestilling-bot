import {google, sheets_v4, gmail_v1} from "googleapis"
import path from "node:path"
import appRootPath from "app-root-path"
import {EnvironmentVariable, needEnvVariable} from "../util/config.js"
import {PubSub} from "@google-cloud/pubsub"

const SERVICE_ACCOUNT_CREDS_PATH = path.join(appRootPath.path, "service_account.json")

export let sheetsClient: sheets_v4.Sheets
export let gmailClient: gmail_v1.Gmail
export let pubsubClient: PubSub

export function setupGoogleServices(): void {
    const auth = new google.auth.GoogleAuth({
        keyFilename: SERVICE_ACCOUNT_CREDS_PATH,
        scopes: [
            "https://mail.google.com/",
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/spreadsheets.readonly"
        ],
        clientOptions: {
            subject: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
        }
    })

    if (!auth) throw new Error("Could not load service account, missing credentials?")

    google.options({auth: auth})

    pubsubClient = new PubSub({
        projectId: needEnvVariable(EnvironmentVariable.GOOGLE_PROJECT_ID),
        keyFilename: SERVICE_ACCOUNT_CREDS_PATH,
    })

    gmailClient = google.gmail({version: "v1"})
    sheetsClient = google.sheets({ version: "v4" })
}
