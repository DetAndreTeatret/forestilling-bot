import {needNotNullOrUndefined} from "../util/util.js"
import {
    ComponentType,
    ContainerBuilder, EmbedBuilder,
    GuildChannel,
    GuildMember,
    InteractionWebhook,
    MessageFlagsBitField,
    Snowflake, TextChannel
} from "discord.js"
import {
    createDatabaseAnnouncement,
    deactivateDatabaseAnnouncement,
    needAnnouncementData
} from "../database/announcement.js"
import {discordClient, postUrgentDebug} from "../discord/client.js"
import {Logger} from "../util/logging.js"
import {addNagJob, deleteNagJobs} from "./messageQueue.js"
import {renderDateMMDDhh} from "../util/date.js"

const DAY_IN_MILLISECONDS = 24*60*60*1000

export type LegalEmoijiesKey = typeof legalEmojiSets[number]["key"]

export const legalEmojiSets = [{
    key: "Ja/Nei",
    names: ["👍", "👎"], // U+1F44D (thumbs up), U+1F44E (thumbs down)
    ids: [null, null]
}, {
    key: "Ja/Nei/Kanskje",
    names: ["Ja", "Nei", "🤷"],
    ids: ["1024249472668151808", "1024249582739267654", null]
}, {
    key: "Lest",
    names: ["Lest"],
    ids: ["1024978383307817020"]
}] as const


interface NagAction {
    readonly hours: number
    readonly discord: boolean
    readonly mail: boolean
}

/**
 * Defaults to Discord only when only hours are provided
 */
function nag(hours: number, discord: boolean = true, mail: boolean = false): NagAction {
    return {hours: hours, discord: discord, mail: mail}
}

export type NaggingRulesKey = keyof typeof naggingRules

// Strategies for nagging over time, each number is the number of hours after the last nag
// The last number will be repeated until nagging stops (e.g, 1 hour interval nagging until the respondent finally responds)
// The first number is after the initial deadline, so each first step here is really the second nag
// Currently only Quick is used
export const naggingRules = {
    // After 2 hours send a mail
    // After 4 hours send a Discord msg and mail, forever
    "ASAP": [nag(2, false, true), nag(4, true, true)],
    // After 24 hours send a Discord msg
    // After 12 hours send a mail
    // After 12 hours send a Discord msg
    // After 12 hours send a Discord msg and mail forever
    "Quick": [nag(24), nag(12, false, true), nag(12), nag(12, true, true)],
    // After 24 hours send a Discord msg
    // After 12 hours send a mail
    // After 24 hours send a Discord msg
    // After 24 hours send a Discord msg and mail
    // After 12 hours send a Discord msg
    // After 12 hours send a Discord msg and mail, forever
    "Chill": [nag(24), nag(12, false, true), nag(24), nag(24, true, true), nag(12), nag(12, true, true)]
} as const

export class Announcement {
    readonly owner: GuildMember
    readonly channel: GuildChannel
    title: string
    content: string
    // The deadline before nagging starts, when hit a Discord message is sent, subsequent nags are defined in the ruleset "naggingRule"
    deadline: string
    messageWebhook: InteractionWebhook

    // These values are not known at initiation of creation
    nagUsers: Snowflake[]
    nagRoles: Snowflake[]
    // The rule describe the strategy for nagging over time after the deadline has been reached
    // Se const for how logic should work
    naggingRule?: NaggingRulesKey
    // Which emojies are to be used as reaction reply options?
    legalEmojies?: LegalEmoijiesKey

    constructor(owner: GuildMember, channel: GuildChannel, title: string, content: string, deadline: string, messageWebhook: InteractionWebhook) {
        this.owner = owner
        this.channel = channel
        this.title = title
        this.content = content
        this.deadline = deadline
        this.messageWebhook = messageWebhook
        this.nagUsers = []
        this.nagRoles = []
    }

    nagWho(channel: GuildChannel) {
        const result = [""].concat(this.nagUsers)
        channel.members.forEach(member => {
            for (const role of this.nagRoles) {
                if (member.roles.cache.has(role)) result.push(member.id)
            }
        })
        return result.filter((id, i) => !(id === "" || result.indexOf(id) !== i))
    }

    hasAnyToNag() {
        return this.nagUsers.length > 0 || this.nagRoles.length > 0
    }
}

/**
 * Checks if necessary information on an announcement is present before publishing
 *
 * @return true if necessary info is present, if an error is found an error string is returned describing whats missing
 * @param announcement
 */
export function canActivateAnnouncement(announcement: Announcement) {
    const errors: string[] = []
    if (!announcement.legalEmojies) errors.push("- Reaksjoner for å svare er ikke definert")
    // if (!announcement.naggingRule) errors.push("- Masestrategi er ikke valgt")
    if (!announcement.hasAnyToNag()) errors.push("- Kunngjøringen må ha minst 1 bruker eller 1 rolle som mottakere")

    if (errors.length > 0) return errors.join("\n")
    return true
}

export async function activateAnnouncement(announcement: Announcement, channel: TextChannel) {
    if (!announcement.legalEmojies) throw new Error("ILLEGAL STATE")
    // Post announcement to channel
    const embed = new EmbedBuilder()
    embed.setTitle(announcement.title)
    embed.setDescription(announcement.content)
    embed.addFields(
        {name: "Svarfrist(Før masing begynner)", value: renderDateMMDDhh(parseAnnouncementDeadline(announcement.deadline))},
        {name: "Svar da!", value: "For å svare på denne bruk en av emojiene under denne meldingen. Hvis du ikke svarer innen fristen vil du bli mast på helt til du svarer", inline: false}
    )
    embed.setFooter({text: "Denne kunngjøringen ble sendt ut av " + (announcement.owner.nickname ?? announcement.owner.displayName)})
    embed.setColor("Random")

    const naggersResolved = announcement.nagWho(channel)
    const announcementMessage = await channel.send({
        embeds: [embed],
        content: naggersResolved.map(who => `<@${who}>`).join(" ")
    })

    const legalEmojis = legalEmojiSets.find(set => set.key === announcement.legalEmojies)
    if (!legalEmojis) throw new Error("No legal emoji set found from key...")
    for (let i = 0; i < legalEmojis.ids.length; i++) {
        const name = legalEmojis.names[i]
        const id = legalEmojis.ids[i]

        if (!id) {
            await announcementMessage.react(name)
        } else {
            await announcementMessage.react(`<:${name}:${id}>`)
        }
    }

    announcementMessage.pin()

    const id = Math.floor(Math.random() * 1000)
    // It's time, activate all announcement forces
    await createDatabaseAnnouncement(announcement, id, announcementMessage.id, naggersResolved)

    const deadline = parseAnnouncementDeadline(announcement.deadline)
    // If the deadline is in under 24h send the mail after 10 sec, if not the mail goes out after 24h
    const initialMailDeadline = deadline.getTime() - Date.now() <= DAY_IN_MILLISECONDS ? 10000 : DAY_IN_MILLISECONDS
    addNagJob("initiateNagging", {
        announcement: id,
        step: -2
    }, new Date(Date.now() + initialMailDeadline))

    addNagJob("initiateNagging", {
        announcement: id,
        step: -1
    }, deadline)

    await announcement.messageWebhook.editMessage("@original", {
        components: [],
        content: "Kunngjøring har blitt aktivert! Denne meldingen kan nå skjules",
        embeds: []
    })
}

/**
 * Stop an announcement! Can be called for early stops or when fully completed
 *
 * Deletes remaining queued jobs and data from the database, and sends a notice to the announcement OP with the stats for the announcement at
 * the time of stopping.
 * @param announcementID
 * @param deleteMessage if this is true the original Discord message will be deleted from the channel it was posted. If it is false it will be kept, but
 * the bot will not prevent any users from deleting it.
 * @param reason why is the announcement stopped? The reason is preceded with "fordi"
 * @param logger
 */
export async function stopAnnouncement(announcementID: number, deleteMessage: boolean, reason: string, logger: Logger) {
    // If not, time to deactivate!
    // To preserve the state of the announcement with reactions at the time it is marked as completed, we send a message to the announcement OP.

    const announcement = await needAnnouncementData(announcementID)
    const channel = await discordClient.guild.channels.fetch(announcement.announcementChannelID)
    if (!channel || !channel.isTextBased()) throw Error("Cant find announcement message when trying to close announcement")
    const message = await channel.messages.fetch(announcement.announcementMessageID)
    // Map users to each reaction name
    const reactionsMapped: Map<string, Snowflake[]> = new Map()
    for (const reaction0 of message.reactions.cache) {
        const reaction = reaction0[1]
        const users = (await reaction.users.fetch()).filter(user => !user.bot).map(user => user.displayName)
        if (!reaction.emoji.name) {
            throw new Error("Emoji has no name??")
        }

        if (users.length === 0) users.push("Ingen har reagert med denne")

        reactionsMapped.set(reaction.emoji.name, users)
    }
    const reactionsMappedText = Array.from(reactionsMapped).map(entry => `${entry[0]}:\n${entry[1].join(", ")}`).join("\n")

    await logger.logLine(`Announcement with title ${announcement.title} is now complete.`)
    await logger.logLine("At the time of completion the announcement had the following reactions:")
    await logger.logLine(reactionsMappedText)

    if (deleteMessage) {
        logger.logLine("Deleting original message of announcement")
        const channel = discordClient.guild.channels.resolve(announcement.announcementChannelID)
        if (!channel || !channel.isTextBased()) {
            logger.logWarning(`Could not find channel of original announcement message! ${channel && !channel?.isTextBased() ? "Is non-text type " + channel.type + ". " : ""} Ignoring delete request`)
        } else channel.messages.delete(announcement.announcementMessageID)

    }

    const report = new ContainerBuilder({
        components: [
            {
                content: "En kunngjøring som du lagde har blitt stoppet! \nÅrsaken er fordi: " + reason,
                type: ComponentType.TextDisplay
            },
            {
                type: ComponentType.Separator
            },
            {
                content: reactionsMappedText,
                type: ComponentType.TextDisplay
            },
        ]
    })
    const announcementOP = discordClient.guild.members.resolve(announcement.originalNagger)
    if (announcementOP) {
        await announcementOP.send({
            components: [
                report
            ],
            flags: MessageFlagsBitField.Flags.IsComponentsV2
        })
    } else {
        await postUrgentDebug("Ooops could not find original announcement owner? ID: " + announcement.originalNagger + ". Announcement stop report will follow")
        await postUrgentDebug("Reason " + reason + ". Reactions: " + reactionsMappedText)
    }

    // To be safe we flush the job queue for related jobs
    deleteNagJobs(announcement.id)
    await deactivateDatabaseAnnouncement(announcement.id, announcement.announcementMessageID)
}

export function parseAnnouncementDeadline(deadline: string) {
    const parts = needNotNullOrUndefined(deadline.match(/(\d+)(h)?/), "Parsing announcement deadline")
    const deadlineDate = new Date()
    const delay = Number(parts[1])
    const isHours = parts.at(2)
    if (isHours) {
        deadlineDate.setHours(deadlineDate.getHours() + delay)
    } else {
        deadlineDate.setDate(deadlineDate.getDate() + delay)
    }

    return deadlineDate
}

// Type predicate helpers

/*
export function isValidNaggingKey(key: string): key is NaggingRulesKey {
    return Object.keys(naggingRules).includes(key)
}
*/

export function isValidEmojiSetKey(key: string): key is LegalEmoijiesKey {
    return legalEmojiSets.some(set => set.key === key)
}

