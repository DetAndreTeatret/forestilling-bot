import Connection from "node-imap"
import nodemailer, {SentMessageInfo} from "nodemailer"
import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {htmlToText} from "html-to-text"
import {simpleParser} from "mailparser"
import {fetchShowDayByDate} from "../database/showday.js"
import {updateFoodConversation, whoOrderedForChannel} from "../database/food.js"
import {receiveFoodOrderResponse} from "../discord/food.js"
import {needNotNullOrUndefined} from "../common/util.js"
import {postUrgentDebug} from "../discord/discord.js"
import {renderDateYYYYMMDD} from "../common/date.js"
import {Readable} from "node:stream"
import {google} from "googleapis"
import {authenticate} from "@google-cloud/local-auth"
import path from "node:path"
import appRootPath from "app-root-path"

const gmail = google.gmail({
    version: "v1",
    auth: needEnvVariable(EnvironmentVariable.GOOGLE_API_KEY)
})

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

    const auth = await authenticate({
        keyfilePath: path.join(appRootPath.path, "google_secrets.json"),
        scopes: [
            "https://mail.google.com/",
            "https://www.googleapis.com/auth/gmail.metadata",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.readonly",
        ],
    })

    google.options({auth})

    const res = await gmail.users.watch({
        userId: "me",
        requestBody: {
            // Replace with `projects/${PROJECT_ID}/topics/${TOPIC_NAME}`
            topicName: "projects/matmail-433010/topics/gmail",
        },
    })
    console.log(res.data)

}

export async function sendFoodMail(body: string): Promise<Error | null> {
    // Obtain user credentials to use for the request
    const auth = await authenticate({
        keyfilePath: path.join(__dirname, '../oauth2.keys.json'),
        scopes: [
            'https://mail.google.com/',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.send',
        ],
    })

    google.options({auth})


    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {

        },
    })
    console.log(res.data)

    return new Promise((resolve) => {
        const message = {
            from: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
            to: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_FOODORDER),
            subject: "Matbestilling fra Det Andre Teatret " + renderDateYYYYMMDD(new Date()),
            text: body
        }

        smtp.sendMail(message, (err) => {
            resolve(err)
        })
    })
}

/**
 * Should reply to today's conversation between orderer and restaurant
 * @param orderText The text to send as mail body
 * @param replyId The id of the mail to reply to
 * @param subject the subject of this mail thread(important for threading)
 * @param callback returns errors if any arise
 */
export function replyFoodMail(orderText: string, replyId: string, subject: string, callback: (err: Error | null) => void) {
    const message = {
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
    }

    smtp.sendMail(message, (err) => {
        callback(err)
    })
}

/**
 * Handles food mail reply from restaurant
 * @param body the content of the mail to be sent to the food orderer
 * @param mailConvoID the Message-ID
 * @param mailConvoSubject
 */
async function receiveFoodMail(body: string, mailConvoID: string, mailConvoSubject: string) {
    const showDay = await fetchShowDayByDate(new Date(), false)
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

