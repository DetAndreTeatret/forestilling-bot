import {ConsoleLogger} from "../util/logging.js"
import {Redis} from "ioredis"
import {Job, Queue, Worker} from "bullmq"
import {discordClient} from "../discord/client.js"
import {DatabaseUser, fetchUser} from "../database/user.js"
import {getSinglePersonnel} from "../smartsuite/personnel.js"
import {sendNagMail} from "../mail/mail.js"
import {Snowflake} from "discord.js"
import {inspect} from "util"
import {needNaggingData} from "../database/announcement.js"
import {naggingRules, stopAnnouncement} from "./announcement.js"

// A job that starts a round of nagging, resulting in x amount of nag jobs being posted (and another of itself if necessary)
export interface NagInitiationJobData {
    // When is/was the deadline of the announcement, formatted as a readable string
    announcementDeadline: string
    // Related to which announcement (database entry id)
    announcement: number
    // Which number of nag is this
    step: number
}

// A job that does the actual nagging to a single user
interface NagJobData {
    // Which number of nag is this
    step: number
    // Related to which announcement (database entry id)
    announcement: number
    // The title of the announcement
    announcementTitle: string
    // When is/was the deadline of the announcement, formatted as a readable string
    announcementDeadline: string
    // Display name of the user who started the nagging in the first place...
    originalNagger: string
    // Who am I nagging
    userToNag: DatabaseUser | undefined
    // Snowflake as backup if no user??
    snowflakeBackup: Snowflake
    // Nag on discord?
    discord: boolean
    // Nag on mail?
    mail: boolean
    // Some needed context info for the nag
    announcementChannelID: Snowflake
    announcementMessageID: Snowflake
}

type NagJobNames = "initiateNagging" | "nag"
type NagJobDataTypes = NagInitiationJobData | NagJobData

const connection = new Redis({maxRetriesPerRequest: null})
const naggingQueue = new Queue<NagJobDataTypes, void, NagJobNames>("mainQueue", {connection})
let worker: Worker<NagJobDataTypes, void, NagJobNames> | undefined
const messageQueueLogger = new ConsoleLogger("[BullMQ]")

/**
 * Queue setup:
 *
 * Each step in the nagging is a nagging "initiation", the initiation job knows its step so it can fetch info about how the nag should be done
 * but does not do the actual nag per user. The initiation job results in posting of X amount of nag jobs based on who has answered yet and the
 * posting of another initiation job when the time comes for the next step.
 *
 * A nag job is just a task to send a message and/or a mail to a given user, the job does not need to know anything else than who to nag
 * and if a message and/or mail is to be sent.
 *
 * Step -2 is always a mail only nag, deployed as an initial reminder that an announcement has been created
 * Step -1 is always a Discord only nag, and is deployed at the time of the deadline, starting the automatic nagging process.
 * Step 0 and onwards are deployed automatically according to the nagging rules provided if people do not respond before the deadline
 */
export function setupMessageQueue() {
    naggingQueue.getJobs().then(jobs => jobs.forEach(async job => {
        if (await job.isCompleted()) return
        messageQueueLogger.logLine(">>> " + await jobToString(job) + " <<<")
    }))
    worker = new Worker("mainQueue", async (job) => {
        if (job.name === "initiateNagging") {
            const data = job.data as NagInitiationJobData
            const announcementData = await needNaggingData(data.announcement)

            const member = await discordClient.guild.members.fetch(announcementData.originalNagger)

            // If no-one is left to nag just stop the announcement and exit
            if (announcementData.nagWho.length <= 0) {
                await stopAnnouncement(data.announcement, false, "Alle som skal svare har svart!", messageQueueLogger)
                return
            }

            // The first two nags are always pre-determined
            if (data.step === -2) {
                announcementData.nagWho.forEach(snowflake => {
                    fetchUser(undefined, snowflake).then(who => {
                        addNagJob("nag", {
                            step: data.step,
                            announcement: data.announcement,
                            announcementTitle: announcementData.title,
                            announcementDeadline: data.announcementDeadline,
                            originalNagger: member.displayName,
                            userToNag: who,
                            snowflakeBackup: snowflake,
                            discord: false,
                            mail: true,
                            announcementChannelID: announcementData.announcementChannelID,
                            announcementMessageID: announcementData.announcementMessageID
                        })
                    })
                })
                return
            }
            if (data.step === -1) {
                announcementData.nagWho.forEach(snowflake => {
                    fetchUser(undefined, snowflake).then(who => {
                        addNagJob("nag", {
                            step: data.step,
                            announcement: data.announcement,
                            announcementTitle: announcementData.title,
                            announcementDeadline: data.announcementDeadline,
                            originalNagger: member.displayName,
                            userToNag: who,
                            snowflakeBackup: snowflake,
                            discord: true,
                            mail: false,
                            announcementChannelID: announcementData.announcementChannelID,
                            announcementMessageID: announcementData.announcementMessageID
                        })
                    })
                })
                addNagJob("initiateNagging", {
                    announcementDeadline: data.announcementDeadline,
                    announcement: data.announcement,
                    step: 0
                }, new Date(Date.now() + naggingRules.Quick[0].hours * 60 * 60 * 1000))
                return
            }

            const nagAction = naggingRules.Quick[Math.min(data.step, naggingRules.Quick.length - 1)]
            announcementData.nagWho.forEach(snowflake => {
                fetchUser(undefined, snowflake).then(who => {
                    addNagJob("nag", {
                        step: data.step,
                        announcement: data.announcement,
                        announcementTitle: announcementData.title,
                        announcementDeadline: data.announcementDeadline,
                        originalNagger: member.displayName,
                        userToNag: who,
                        snowflakeBackup: snowflake,
                        discord: nagAction.discord,
                        mail: nagAction.mail,
                        announcementChannelID: announcementData.announcementChannelID,
                        announcementMessageID: announcementData.announcementMessageID
                    })
                })
            })

            addNagJob("initiateNagging", {
                announcementDeadline: data.announcementDeadline,
                announcement: data.announcement,
                step: data.step + 1
            }, new Date(Date.now() + naggingRules.Quick[Math.min(data.step + 1, naggingRules.Quick.length - 1)].hours * 60 * 60 * 1000))
        } else if (job.name === "nag") {
            const data = job.data as NagJobData
            const nagger = await discordClient.guild.members.fetch(data.originalNagger)
            const naggerName = nagger.nickname ?? nagger.displayName

            const messageLink = `https://discord.com/channels/${discordClient.guild.id}/${data.announcementChannelID}/${data.announcementMessageID}`

            // If we can't send a mail for some reason we send a discord message, as long as this nag does not already send a Discord message
            if (data.mail) {
                if (!data.userToNag || !data.userToNag.smartSuiteRecordID) {
                    messageQueueLogger.logLine(">>> " + data.userToNag?.userId + " does not have a linked SmartSuite record, defaulting to Discord")
                    data.discord = true
                } else {
                    const recipient = await getSinglePersonnel(data.userToNag.smartSuiteRecordID)
                    if (!recipient) throw new Error("Uh oh, stored SmartSuite record ID does not find any existing record?!")
                    if (recipient.mail) {
                        await sendNagMail(recipient.mail, messageLink, naggerName, getNaggingMessageContent(data.step, "Mail", naggerName, data.announcementTitle, data.announcementDeadline, messageLink))
                        await messageQueueLogger.logLine(">>> Sent Mail nag to " + data.userToNag.discordSnowflake + "//" + recipient.mail)
                    } else {
                        messageQueueLogger.logLine(">>> " + data.userToNag.userId + " does not have a linked e-mail, defaulting to Discord")
                        data.discord = true
                    }
                }
            }

            if (data.discord) {
                const snowflake = data.userToNag?.discordSnowflake ?? data.snowflakeBackup
                await discordClient.users.send(snowflake, getNaggingMessageContent(data.step, "Discord", naggerName, data.announcementTitle, data.announcementDeadline, messageLink))

                await messageQueueLogger.logLine(">>> Sent Discord nag to " + snowflake)
            }
        }
    }, {
        connection: connection,
        autorun: true, // TODO
        removeOnFail: {count: 1000},
        removeOnComplete: {count: 500}
    })
    messageQueueLogger.logLine("Done setting up message queue stuff")
    // naggingQueue.drain(true)
}

function getNaggingMessageContent(step: number, medium: "Discord" | "Mail", naggerName: string, announcementTitle: string, deadline: string, messageLink: string) {
    let answer
    if (step === -2) {
        // This is a message sent 24h or closer to the announcement post to remind people that they need to respond
        answer = "Hei!\n\n" + naggerName + " har lagt ut en kunngjøring " + (medium === "Mail" ? "på Discord" : "her på Discord") + "med tittel " + announcementTitle + " som de har spurt om svar fra deg på.\n" +
            "De har satt fristen til " + deadline + ", lykke til!"
    } else if (step === -1) {
        answer = "Heisann!\n\nKunngjøringen til " + naggerName + " med tittel " + announcementTitle + " har nå nådd fristen sin før masing begynner, og den savner fortsatt et svar fra deg.\n" +
            "Du kommer til å fortsette å få påminnelser helt til du har svart eller til " + naggerName + " avslutter masingen manuelt..."
    } else {
        answer = "Heisann på deisann!\n\nKunngjøringen til " + naggerName + " med tittel " + announcementTitle + " hadde svarfrist " + deadline + ", og savner fortsatt svar fra deg!\n" +
            "\"Du kommer til å fortsette å få påminnelser helt til du har svart eller til " + naggerName + " avslutter masingen manuelt...\""
    }

    if (medium === "Mail") {
        answer += "\n\nSvar til denne epostadressen leses ikke, hvis du har spørsmål bør du kontakte " + naggerName + " direkte :)\n\n*************\n\n\nMvh\nDet Andre Teatrets store robothjerne\n\nDET ANDRE TEATRET\n- nesten som et ordentlig teater, bare litt morsommere -\n\nwww.detandreteatret.no\nfacebook.com/detandreteatret\n\n\"Det er viktig å kle av seg på scenen iblant\"\n- Mats Eldøen\n\n"
    }

    if (medium === "Discord") {
        answer += "\n\nDu kan trykke her for å se kunngjøringen: " + messageLink
    }

    if (!answer) throw new Error("Could not generate nagging message content for step " + step + " and medium " + medium)

    return answer
}

export async function shutdownMessageQueue() {
    await messageQueueLogger.logLine("Closing workers and queues")
    await worker?.close()
    await naggingQueue.close()
}

export async function getAllJobs(...excludeStatus: Awaited<ReturnType<InstanceType<typeof Job>["getState"]>>[]) {
    const jobs = await naggingQueue.getJobs()
    if (!excludeStatus) return jobs

    return (await Promise.all(
        jobs.map(async (j) => ({job: j, status: await j.getState()}))))
        .filter(({status}) => !excludeStatus.includes(status)).map(({job}) => job)
}

export function deleteNagJobs(announcementId: number) {
    naggingQueue.getJobs().then(jobs =>
        jobs.filter(job => job.data.announcement === announcementId).forEach(job => job.remove())
    )
}

/**
 * Add a job to the queue, if a deadline is provided the job will be delayed until the given date.
 * No jobs will be run between 2000 and 0800, if any deadline lands in this time range it is postponed until 0800.
 */
export function addNagJob(name: NagJobNames, data: NagJobDataTypes, deadline?: Date) {
    if ((name === "nag" && "step" in data) || (name === "initiateNagging" && "snowflakeBackup" in data)) {
        throw new Error("You must use the correct data type for the submitted job. Submitted job was of type " + name + " but used data type for another type. " + data)
    }
    let delay
    if (deadline) {
        const deadlineClone = new Date(deadline)
        // No nags between 2000 and 0800
        if (deadlineClone.getHours() >= 19 || deadlineClone.getHours() <= 7) {
            // If 2000-2400 bump the day
            if (deadlineClone.getHours() >= 19) {
                deadlineClone.setDate(deadlineClone.getDate() + 1)
            }
            deadlineClone.setHours(8)
            deadlineClone.setMinutes(0)
            deadlineClone.setSeconds(0)
        }
        delay = Number(deadlineClone) - Number(new Date())
    }

    naggingQueue.add(name, data, {delay: delay}).then(job => {
        messageQueueLogger.logLine("Added new initiateNagging job to be executed in " + quickPrettyMs(job.delay))
    })
}

export async function jobToString(job: Job<NagJobData | NagInitiationJobData>) {
    if (!job || !job.name) return inspect(job, {depth: 30})
    const state = await job.getState()
    const jobStateBlob = `State: ${state},${state === "failed" ? " Failed reason: " + job.failedReason : ""}, Data: ${JSON.stringify(job.data)}\n         >>>`
    if (job.name === "initiateNagging") {
        const j = job.data as NagInitiationJobData
        // job.delay returns the delay specified at job creation, so we have to calculate the expected delay from this point in time ourselves
        const scheduledExecute = job.delay - (Date.now() - job.timestamp)
        return jobStateBlob + `Next nag initiation for announcement with id ${j.announcement} at step ${j.step} should be started in ${quickPrettyMs(scheduledExecute)}`
    } else if (job.name === "nag") {
        const j = job.data as NagJobData
        return jobStateBlob + `${j.originalNagger} is about to nag ${j.userToNag?.discordSnowflake ?? j.snowflakeBackup} on mail(${j.mail})/Discord(${j.discord}) in channel: ${j.announcementChannelID} -> message: ${j.announcementMessageID}`
    }
    return jobStateBlob + "Mysterious job! " + job
}

function quickPrettyMs(ms: number) {
    if (ms === 0) return 0
    const sec = Math.floor(ms / 1000)
    if (sec === 0) return ms + "ms"
    const min = Math.floor(sec / 60)
    if (min === 0) return sec + "s"
    const hours = Math.floor(min / 60)
    if (hours === 0) return `${min}m ${sec % 60}s`
    const days = Math.floor(hours / 60)
    if (days === 0) return `${hours}h ${min % 60}m`
    return `${days}d ${hours % 60}h`
}
