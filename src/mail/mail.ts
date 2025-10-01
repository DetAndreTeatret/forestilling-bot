import {EnvironmentVariable, needEnvVariable} from "../util/config.js"
import MailComposer from "nodemailer/lib/mail-composer/index.js"
import {fetchShowDayByDate} from "../database/showday.js"
import {updateFoodConversation, whoOrderedForChannel} from "../database/food.js"
import {receiveFoodOrderResponse} from "../discord/food.js"
import {renderDateYYYYMMDD} from "../util/date.js"
import {google} from "googleapis"
import path from "node:path"
import appRootPath from "app-root-path"
import {APIEndpoint} from "googleapis-common"
import {PubSub} from "@google-cloud/pubsub"
import {simpleParser} from "mailparser"
import {startDaemon} from "./daemon.js"
import {ConsoleLogger} from "../util/logging.js"
import {postUrgentDebug} from "../discord/client.js"

export let gmail: APIEndpoint

const SERVICE_ACCOUNT_CREDS_PATH = path.join(appRootPath.path, "service_account.json")

const logger = new ConsoleLogger("[Mail]")

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
// | |   Handles mail logic for food ordering and nagging          | |
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
    const auth = loadServiceAccountCreds()
    if (!auth) throw new Error("Could not load service account, missing credentials?")

    google.options({auth: auth})

    gmail = google.gmail({
        version: "v1"
    })

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

    const pubsub = new PubSub({projectId: needEnvVariable(EnvironmentVariable.GOOGLE_PROJECT_ID),
        // @ts-ignore
        auth: auth})
    const sub = pubsub.subscription("gmail-sub")

    sub.on("message", async function(message) {
        message.ack()

        await logger.logLine("Gmail notification! Checking for cool and relevant emails")

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
            logger.logLine("No interesting mails... ")
            return
        }

        logger.logLine("Found cool and relevant mail, proceeding with fetching etc..")

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
        logger.logWarning("Gmail Pub/Sub error!! "  + error)
        console.dir(error, {depth: 10})
        postUrgentDebug("Gmail Pub/Sub error!! "  + error)
    })

}

export async function sendFoodMail(body: string) {
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

    logger.logLine("Sent mail to restaurant! ")
}

/**
 * Should reply to today's conversation between orderer and restaurant
 * @param orderText The text to send as mail body
 * @param referenceIDs The reference headers of this mail thread
 * @param subject the subject of this mail thread(important for threading)
 * @param callback returns errors if any arise
 */
export async function replyFoodMail(orderText: string, referenceIDs: string[], subject: string, callback: (err: Error | null) => void) {
    const mail = new MailComposer({
        from: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
        to: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_FOODORDER),
        subject: subject,
        text: orderText,
        inReplyTo: referenceIDs[referenceIDs.length - 1],
        // This should now conform to RFC 2822(ref: https://datatracker.ietf.org/doc/html/rfc2822#appendix-A.2)
        // Also https://developers.google.com/gmail/api/guides/threads and https://stackoverflow.com/a/29531009
        references: referenceIDs.join(" ")
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

export async function sendNagMail(toWho: string, where: string, nagger: string) {
    const mail = new MailComposer({
        from: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM), // TODO ikke fra matbestilling...
        to: toWho,
        subject: `${nagger} har lagt ut en kunngjøring på Discord og trenger svar fra deg`,
        text: "masmasmas, please svar bby\n" + where + "\n\n Svar leses ikke"
    })

    const builtMail = await mail.compile().build()

    await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: builtMail.toString("base64")
        },
    })

    logger.logLine("Sent nagging mail to " + toWho + " for " + where + " from " + nagger)
}

async function handleRogueMail(body: string, reason: string) {
    const warning = reason + "\n\n\"" + body + "\""
    logger.logWarning(warning)
    await postUrgentDebug(warning)
}

/**
 * Reads previously authorized credentials from the save file.
 */
function loadServiceAccountCreds() {
    try {
        return new google.auth.GoogleAuth({
            keyFilename: SERVICE_ACCOUNT_CREDS_PATH,
            scopes: [
                "https://mail.google.com/",
                "https://www.googleapis.com/auth/pubsub",
                "https://www.googleapis.com/auth/cloud-platform",
            ],
            clientOptions: {
                subject: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
            }
        })
    } catch (err) {
        logger.logWarning("Could not load service account creds because of " + err)
        return null
    }
}
