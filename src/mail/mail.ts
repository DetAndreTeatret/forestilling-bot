import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import MailComposer from "nodemailer/lib/mail-composer/index.js"
import {fetchShowDayByDate} from "../database/showday.js"
import {updateFoodConversation, whoOrderedForChannel} from "../database/food.js"
import {receiveFoodOrderResponse} from "../discord/food.js"
import {postUrgentDebug} from "../discord/discord.js"
import {renderDateYYYYMMDD} from "../common/date.js"
import {google} from "googleapis"
import {authenticate} from "@google-cloud/local-auth"
import path from "node:path"
import appRootPath from "app-root-path"
import {APIEndpoint} from "googleapis-common"
import {OAuth2Client} from "google-auth-library"
import {PubSub} from "@google-cloud/pubsub"
import fs from "node:fs"
import {simpleParser} from "mailparser"
import {startDaemon} from "./deamon.js"

export let gmail: APIEndpoint

const CREDENTIALS_PATH = path.join(appRootPath.path, "google_creds.json")
const TOKEN_PATH = path.join(appRootPath.path, "google_token.json")

//                      ,---.           ,---.
//                     / /"`.\.--"""--./,'"\ \
//                     \ \    _       _    / /
//                      `./  / __   __ \  \,'
//                       /    /_O)_(_O\    \
//                       |  .-'  ___  `-.  |
//                    .--|       \_/       |--.
//                  ,'    \   \   |   /   /    `.
//                 /       `.  `--^--'  ,'       \
//              .-"""""-.    `--.___.--'     .-"""""-.
// .-----------/         \------------------/         \--------------.
// | .---------\         /----------------- \         /------------. |
// | |          `-`--`--'                    `--'--'-'             | |
// | |                                                             | |
// | |   Handles mail logic between food orderer and restaurant    | |
// | |                                                             | |
// | |                                                             | |
// | |_____________________________________________________________| |
// |_________________________________________________________________|
//                    )__________|__|__________(
//                   |            ||            |
//                   |____________||____________|
//                     ),-----.(      ),-----.(
//                   ,'   ==.   \    /  .==    `.
//                  /            )  (            \
//                  `==========='    `==========='  hjw


/**
 * Prepare all mail related shenanigans
 */
export async function setupMailServices() {
    const auth = await authorize()

    gmail = google.gmail({
        version: "v1",
        auth: auth
    })

    google.options({auth: auth})

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

    startDaemon() // This refreshes the watch request once every day

    const pubsub = new PubSub({projectId: needEnvVariable(EnvironmentVariable.GOOGLE_PROJECT_ID), keyFilename: path.join(appRootPath.path, "google_token.json")})
    const sub = pubsub.subscription("gmail-sub")

    sub.on("message", async function(message) {
        message.ack()

        console.log("Gmail notification! Checking for cool and relevant emails")

        // fetching since history id in notification is kinda broken?? gmail api decides randomly when to include the message history
        // when using users#history#list
        // We do a wide search for unread messages from interesting mail addresses instead
        const mails = await gmail.users.messages.list({
            userId: "me",
            q: "from:" + needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_FOODORDER) + ";label:unread"
        })

        const messageInfos: {id: string, threadId: string }[] = [] // TODO Make type
        if (mails.data.messages) {
            for (let i = 0; i < mails.data.messages.length; i++) {
                mails.data.messages.forEach((message: {id: string, threadId: string}) => {messageInfos.push(message)})
            }
        }
        if (messageInfos.length === 0) {
            console.log("No interesting mails... ")
            return
        }

        console.log("Found cool and relevant mail, proceeding with fetching etc..")

        // Fetch and parse the actual messages
        for (const messageInfo of messageInfos) {
            const message = await gmail.users.messages.get({
                userId: "me",
                id: messageInfo.id,
                format: "RAW"})
            if (!message.data.raw) {
                throw new Error("missing raw >:(")
            }
            // TODO can prob switch to message part format to avoid having to parse raw b64 here
            // See https://developers.google.com/gmail/api/reference/rest/v1/users.messages#MessagePart
            // and https://developers.google.com/gmail/api/reference/rest/v1/users.messages/get at the format param
            const parsed = await simpleParser(Buffer.from(message.data.raw, "base64url").toString("utf-8"))

            if (!parsed.text || !parsed.subject || !parsed.messageId) {
                throw new Error("Error parsing mail " + parsed)
            }

            await receiveFoodMail(parsed.text, parsed.messageId, parsed.subject)

            // Remove the unread label so the same mail won't be returned next fetch
            await gmail.users.messages.modify({
                userId: "me",
                id: messageInfo.id,
                removeLabelIds: ["UNREAD"]
            })
        }
    })

    sub.on("error", function(error: Error) {
        postUrgentDebug("Gmail Pub/Sub error!! "  + error)
    })

}

export async function sendFoodMail(body: string) {
    // TODO check for auth refresh?

    const mail = new MailComposer({
        from: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
        to: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_FOODORDER),
        subject: "Matbestilling fra Det Andre Teatret " + renderDateYYYYMMDD(new Date()),
        text: body
    })

    const builtMail = await mail.compile().build()

    await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: builtMail.toString("base64")
        },
    })

    console.log("Sent mail to restaurant! ")
}

/**
 * Should reply to today's conversation between orderer and restaurant
 * @param orderText The text to send as mail body
 * @param replyId The id of the mail to reply to
 * @param subject the subject of this mail thread(important for threading)
 * @param callback returns errors if any arise
 */
export async function replyFoodMail(orderText: string, replyId: string, subject: string, callback: (err: Error | null) => void) {
    const mail = new MailComposer({
        from: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
        to: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_FOODORDER),
        subject: subject,
        text: orderText,
        inReplyTo: replyId,
        // This("references") only appends the Message-ID of the last received email, but seems to work fine on Gmail, so I
        // won't bother going full RFC 2822(ref: https://datatracker.ietf.org/doc/html/rfc2822#appendix-A.2)
        // Also https://developers.google.com/gmail/api/guides/threads and https://stackoverflow.com/a/29531009
        // (You are actually supposed to keep all reference headers going down the thread)
        references: replyId
    })

    const builtMail = await mail.compile().build()

    await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: builtMail.toString("base64")
        },
    })

    callback(null)
}

/**
 * Handles food mail reply from restaurant
 * @param body the content of the mail to be sent to the food orderer
 * @param mailConvoID the Message-ID
 * @param mailConvoSubject
 */
async function receiveFoodMail(body: string, mailConvoID: string, mailConvoSubject: string) {
    const showDay = await fetchShowDayByDate(new Date(), false)

    // Remove the "replied to" part in the email, we only want the actual response.
    // Mostly because we easily hit the max char limit for embed text if we include the earlier messages in the email thread
    body = body.split("\n").filter(s => !s.startsWith(">")).join("\n")
    if (!showDay) {
        // Uh oh, rogue email
        await handleRogueMail(body, "Mail mottatt fra resturant uten at det er noen oppførte forestillinger i dag")
        return
    }

    const orderer = await whoOrderedForChannel(showDay.discordChannelSnowflake)
    if (!orderer) {
        await handleRogueMail(body, "Mail mottatt fra resturant uten at det er noen som har bestilt mat i dag enda")
        return
    }

    await updateFoodConversation(orderer, mailConvoID, mailConvoSubject)

    await receiveFoodOrderResponse(body, orderer)
}

async function handleRogueMail(body: string, reason: string) {
    await postUrgentDebug(reason + "\n\n\"" + body + "\"")
}

/**
 * Reads previously authorized credentials from the save file.
 */
function loadSavedCredentialsIfExist(): OAuth2Client | null {
    try {
        const content = fs.readFileSync(TOKEN_PATH).toString()
        const credentials = JSON.parse(content)
        return google.auth.fromJSON(credentials) as OAuth2Client
    } catch (err) {
        return null
    }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 * // TODO find page that gave you this preset? Link here
 */
function saveCredentials(client: OAuth2Client) {
    const content = fs.readFileSync(CREDENTIALS_PATH).toString()
    const keys = JSON.parse(content)
    const key = keys.installed || keys.web
    const payload = JSON.stringify({
        type: "authorized_user",
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    })
    fs.writeFileSync(TOKEN_PATH, payload)
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    let client = loadSavedCredentialsIfExist()
    if (client) { // TODO Start here, how to refresh Oauth access?
        return client
    }
    client = await authenticate({
        scopes: [
            "https://mail.google.com/",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.compose",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/pubsub",
        ],
        keyfilePath: CREDENTIALS_PATH,
    })
    if (client.credentials) {
        saveCredentials(client)
    }
    return client
}

