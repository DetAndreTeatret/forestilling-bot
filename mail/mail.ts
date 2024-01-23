import Connection from "node-imap"
import nodemailer, {SentMessageInfo} from "nodemailer"
import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {htmlToText} from "html-to-text"
import {simpleParser} from "mailparser"
import {fetchShowDayByDate} from "../database/showday.js"
import {updateFoodConversation, whoOrderedForChannel} from "../database/food.js"
import {receiveFoodOrderResponse} from "../discord/food.js"
import {needNotNullOrUndefined} from "../common/util.js"

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
export function setupMailServices() {

    // /==============\
    // I     IMAP     I
    // \==============/

    imap = new Connection({
        user: needEnvVariable(EnvironmentVariable.EMAIL_USERNAME),
        password: needEnvVariable(EnvironmentVariable.EMAIL_PASSWORD),
        host: needEnvVariable(EnvironmentVariable.EMAIL_IMAP_HOST),
        port: 993,
        tls: true
    })

    imap.on("ready", () => {
        openInbox((error, mailbox) => {
            if (error || !mailbox.permFlags.includes("\\Seen")) {
                throw new Error("Encountered error while trying to start IMAP server: " + (error === undefined ? "Missing flags" : error))
            } else {
                console.log("IMAP Server up and running (name:" + mailbox.name + ",readOnly:" + mailbox.readOnly + ")")
            }
        })
    })

    imap.on("mail", () => {
        openInbox((error) => {
            if (error) {
                throw new Error("Encountered error while trying to connect to IMAP server: " + error)
            } else {
                imap.search(["UNSEEN", ["FROM", needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_FOODORDER)]], (error, uids) => {
                    if (error) throw new Error("Error while searching through new mails: " + error)
                    console.log("Email received from restaurant! Fetching...")
                    const result = imap.fetch(uids, {markSeen: true, bodies: ""})
                    result.on("message", (message) => {
                        message.on("body", (stream) => {
                            console.log("Starting to read email...")
                            simpleParser(stream, (err, mail) => {
                                if (err) {
                                    throw new Error("Encountered error while trying to parse mail: " + err)
                                }
                                console.log("Successfully parsed email!")
                                if (mail.text) {
                                    receiveFoodMail(mail.text, needNotNullOrUndefined(mail.messageId, "mail message id text")).then(() => console.log("Mail processed(text)"))
                                } else if (mail.html) {
                                    receiveFoodMail(htmlToText(mail.html), needNotNullOrUndefined(mail.messageId, "mail message id html")).then(() => console.log("Mail processed(html)"))
                                } else {
                                    throw new Error("Unable to extract text from mail")
                                }
                            })
                        })
                    })
                    result.once("end", () => {
                        imap.addFlags(uids, "\\\\Seen", () => {
                            // For the current mail host it seems to always throw an error while setting this flag
                            // even though it's actually working(marked as seen).
                            // For now, we just ignore the error, praying that the false positive never will be true
                        })
                    })
                })
            }
        })
    })

    imap.on("error", function (err) {
        console.error("IMAP Error: " + err)
    })

    imap.on("end", function () {
        console.error("IMAP connection closed?")
    })

    imap.connect()

    // /==============\
    // I     SMTP     I
    // \==============/

    smtp = nodemailer.createTransport({
        host: needEnvVariable(EnvironmentVariable.EMAIL_SMTP_HOST),
        port: 587,
        secure: false, // upgrade later with STARTTLS ???
        auth: {
            user: needEnvVariable(EnvironmentVariable.EMAIL_USERNAME),
            pass: needEnvVariable(EnvironmentVariable.EMAIL_PASSWORD),
        },
    })

    console.log("SMTP Transport created!")
}

function openInbox(callback: (error: Error, mailbox: Connection.Box) => void) {
    imap.openBox("INBOX", false, callback)
}

let imap: Connection

let smtp: nodemailer.Transporter<SentMessageInfo>

/**
 * Should reply to today's conversation between orderer and restaurant
 * @param orderText The text to send as mail body
 * @param replyId The id of the mail to reply to
 * @param callback returns errors if any arise
 */
export function replyFoodMail(orderText: string, replyId: string, callback: (err: Error | null) => void) {
    const message = {
        from: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
        to: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_FOODORDER),
        subject: "Matbestilling fra Det Andre Teatret " + new Date().toISOString(),
        text: orderText,
        inReplyTo: replyId
    }
    smtp.sendMail(message, (err) => {
        callback(err)
    })
}

async function receiveFoodMail(body: string, mailConvoID: string) {
    const showDay = await fetchShowDayByDate(new Date(), false)
    if (!showDay) {
        // Uh oh, rogue email
        await sendBackupMail(body, "Mail mottatt fra resturant uten at det er noen oppførte forestillinger i dag")
        return
    }

    const orderer = await whoOrderedForChannel(showDay.discordChannelSnowflake)
    if (!orderer) {
        await sendBackupMail(body, "Mail mottatt fra resturant uten at det er noen som har bestilt mat i dag enda")
        return
    }

    await updateFoodConversation(orderer, mailConvoID)

    await receiveFoodOrderResponse(body, orderer)
}

async function sendBackupMail(body: string, reason: string) { // TODO also send to debug channel in Discord/log?
    console.log("Mail sent to backup mails...(reason:" + reason + ")")
    const message = {
        from: needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_FROM),
        to: fetchBackupEmails(),
        subject: "[DAT Matbestilling] Mail på avveie? " + new Date().toISOString(),
        text: "En feil førte til at denne mailen ble videresendt til backup addresser. \nFeilmelding: \"" + reason + "\"" +
            "\n\nMailens innhold var som følger: \"" + body + "\""
    }
    await smtp.sendMail(message)
}

function fetchBackupEmails() {
    const emails = needEnvVariable(EnvironmentVariable.EMAIL_ADDRESS_TO_BACKUP)

    if (emails.startsWith("[")) {
        return emails.split(",")
    } else return [emails]
}
