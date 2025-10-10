import {ConsoleLogger} from "./logging.js"
import {Redis} from "ioredis"
import {Queue, Worker, Job} from "bullmq"
import {needNaggingData, removeCompletedAnnouncement} from "../database/discord.js"
import {discordClient} from "../discord/client.js"
import {DatabaseUser, fetchUser} from "../database/user.js"
import {getSinglePersonnel} from "../smartsuite/personnel.js"
import {sendNagMail} from "../mail/mail.js"
import {Snowflake} from "discord.js"
import {inspect} from "util"
import {naggingRules} from "../discord/commands/announcement/create.js"

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
 */
export function setupMessageQueue() {
    naggingQueue.getJobs().then(jobs => jobs.forEach(async job => {
        if (await job.isCompleted()) return
        messageQueueLogger.logLine(">>> " + jobToString(job) + " <<<")
    }))
    worker = new Worker("mainQueue", async (job) => {
        if (job.name === "initiateNagging") {
            const data = job.data as NagInitiationJobData
            const naggingData = await needNaggingData(data.announcement)
            const nagRules = naggingRules[naggingData.naggingRulesKey]

            const member = await discordClient.guild.members.fetch(naggingData.originalNagger)

            // The first two nags are always pre determined
            if (data.step === -2) {
                naggingData.nagWho.forEach(snowflake => {
                    fetchUser(undefined, snowflake).then(who => {
                        addNagJob("nag", {
                            announcement: data.announcement,
                            originalNagger: member.displayName,
                            userToNag: who,
                            snowflakeBackup: snowflake,
                            discord: false,
                            mail: true,
                            announcementChannelID: naggingData.announcementChannelID,
                            announcementMessageID: naggingData.announcementMessageID
                        })
                    })
                })
                return
            }
            if (data.step === -1) {
                naggingData.nagWho.forEach(snowflake => {
                    fetchUser(undefined, snowflake).then(who => {
                        addNagJob("nag", {
                            announcement: data.announcement,
                            originalNagger: member.displayName,
                            userToNag: who,
                            snowflakeBackup: snowflake,
                            discord: true,
                            mail: false,
                            announcementChannelID: naggingData.announcementChannelID,
                            announcementMessageID: naggingData.announcementMessageID
                        })
                    })
                })
                addNagJob("initiateNagging", {
                    announcement: data.announcement,
                    step: 0
                }, new Date(Date.now() + nagRules[0].hours * 60 * 60 * 1000))
                return
            }

            const nagAction = nagRules[data.step]
            naggingData.nagWho.forEach(snowflake => {
                fetchUser(undefined, snowflake).then(who => {
                    addNagJob("nag", {
                        announcement: data.announcement,
                        originalNagger: member.displayName,
                        userToNag: who,
                        snowflakeBackup: snowflake,
                        discord: nagAction.discord,
                        mail: nagAction.mail,
                        announcementChannelID: naggingData.announcementChannelID,
                        announcementMessageID: naggingData.announcementMessageID
                    })
                })
            })

            // If anyone left to nag post the next job...
            if (naggingData.nagWho.length > 0) {
                addNagJob("initiateNagging", {
                    announcement: data.announcement,
                    step: data.step + 1
                }, new Date(Date.now() + nagRules[data.step + 1].hours * 60 * 60 * 1000))
            } else {
                // TODO is this enough for closing?
                await removeCompletedAnnouncement(data.announcement)
            }
        } else if (job.name === "nag") {
            const data = job.data as NagJobData

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
                        await sendNagMail(recipient.mail, messageLink, data.originalNagger)
                        await messageQueueLogger.logLine(">>> Sent Mail nag to " + data.userToNag.discordSnowflake)
                    } else {
                        messageQueueLogger.logLine(">>> " + data.userToNag.userId + " does not have a linked e-mail, defaulting to Discord")
                        data.discord = true
                    }
                }
            }

            if (data.discord) {
                const snowflake = data.userToNag?.discordSnowflake ?? data.snowflakeBackup
                await discordClient.users.send(snowflake, "Mas mas mas mas, svar da!!\n\n" + messageLink)

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

export async function getAllJobs() {
    return naggingQueue.getJobs()
}

export function deleteNagJobs(announcementId: number) {
    naggingQueue.getJobs().then(jobs =>
        jobs.filter(job => job.data.announcement === announcementId).forEach(job => job.remove())
    )
}

/**
 * Add a job to the queue, if a deadline is provided the job will be delayed until the given date.
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
        delay = Number(deadline) - Number(new Date())
    }

    naggingQueue.add(name, data, {delay: delay}).then(job => {
        messageQueueLogger.logLine("Added new initiateNagging job to be executed in " + quickPrettyMs(job.delay))
    })
}

export async function shutdownMessages() {
    await messageQueueLogger.logLine("Closing workers and queues")
    await worker?.close()
    await naggingQueue.close()
}

function jobToString(job: Job<NagJobData | NagInitiationJobData>) {
    if (!job || !job.name) return inspect(job, {depth: 30})
    if (job.name === "initiateNagging") {
        const j = job.data as NagInitiationJobData
        // job.delay returns the delay specified at job creation, so we have to calculate the expected delay from this point in time ourselves
        const scheduledExecute = job.delay - (Date.now() - job.timestamp)
        return `Next nag initiation for announcement with id ${j.announcement} at step ${j.step} should be started in ${quickPrettyMs(scheduledExecute)}`
    } else if (job.name === "nag") {
        const j = job.data as NagJobData
        return `${j.originalNagger} is about to nag ${j.userToNag?.discordSnowflake ?? j.snowflakeBackup} on mail(${j.mail})/Discord(${j.discord}) in channel: ${j.announcementChannelID} -> message: ${j.announcementMessageID}`
    }
    return "Mysterious job! " + job
}

function quickPrettyMs(ms: number) {
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

// A job that starts a round of nagging, resulting in x amount of nag jobs being posted (and another of itself if necessary)
export interface NagInitiationJobData {
    // Related to which announcement (database entry id)
    announcement: number
    // Which number of nag is this
    step: number
}

// A job that does the actual nagging to a single user
interface NagJobData {
    // Related to which announcement (database entry id)
    announcement: number
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
