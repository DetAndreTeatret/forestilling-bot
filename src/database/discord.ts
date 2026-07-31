import {GuildChannel, Snowflake} from "discord.js"
import {addEntry, selectEntries, selectEntry, updateEntry} from "./sqlite.js"
import {renderDateYYYYMMDD} from "../util/date.js"
import {
    Announcement,
    isValidEmojiSetKey,
    LegalEmoijiesKey,
} from "../discord/commands/announcement/create.js"
import {needNotNullOrUndefined} from "../util/util.js"

/**
 * Get snowflakes of {@link GuildChannel}s that can be deleted. (System time newer than time stored in database)
 */
export async function getDeleteableChannels(): Promise<Snowflake[]> {
    const columnName = "DiscordChannelSnowflake"
    const result = await selectEntries("ShowDays", "\"" + renderDateYYYYMMDD(new Date()) + "\"" + " > ShowDayDate", [columnName])
    return result.map(value => value[columnName])
}

export async function createDatabaseAnnouncement(announcement: Announcement, id: number, messageID: Snowflake, resolvedNaggers: Snowflake[]) {
    await addEntry("Announcements", id, announcement.owner.id, announcement.channel.id, messageID, announcement.title, announcement.content, needNotNullOrUndefined(announcement.legalEmojies, "createAnnouncement#legalEmojies"), resolvedNaggers.join(","), JSON.stringify([]), Date.now(), true)
    if (!activeAnnouncementsCache) activeAnnouncementsCache = [messageID]
    else activeAnnouncementsCache.push(messageID)
}

export async function editAnnouncement(data: AnnouncementContentData) {
    await updateEntry("Announcements", "AnnouncementID=\"" + data.id + "\"", ["AnnouncementTitle", "AnnouncementText"], [data.title, data.content])
}

export async function needAnnouncementData(announcementID: number): Promise<AnnouncementNaggingData & AnnouncementResponseData & AnnouncementContentData> {
    const result = await selectEntry("Announcements", "AnnouncementID=\"" + announcementID + "\"")
    if (!result || !isValidEmojiSetKey(result["LegalEmojies"])) throw new Error("Error when fetching data of announcement " + result)
    return {
        nagWho: String(result["NonRespondants"]).split(","),
        originalNagger: result["DiscordUserSnowflake"],
        announcementChannelID: result["AnnouncementDiscordChannelSnowflake"],
        announcementMessageID: result["AnnouncementDiscordMessageSnowflake"],
        nonRespondants: String(result["NonRespondants"]).split(","),
        legalEmojies: result["LegalEmojies"],
        respondantData: JSON.parse(result["RespondantData"]),
        id: Number(result["AnnouncementID"]),
        title: result["AnnouncementTitle"],
        content: result["AnnouncementText"],
    }
}

export async function needAllAnnouncementData(ignoreInactive: boolean = true): Promise<(AnnouncementNaggingData & AnnouncementResponseData & AnnouncementContentData)[]> {
    const announcements = await selectEntries("Announcements", "IsActive=\"" + Number(ignoreInactive) + "\"")
    return announcements.map(announcement => {
        if (!isValidEmojiSetKey(announcement["LegalEmojies"])) throw new Error("Error when fetching data of all announcements")

        return {
            nagWho: String(announcement["NonRespondants"]).split(","),
            originalNagger: announcement["DiscordUserSnowflake"],
            announcementChannelID: announcement["AnnouncementDiscordChannelSnowflake"],
            announcementMessageID: announcement["AnnouncementDiscordMessageSnowflake"],
            nonRespondants: String(announcement["NonRespondants"]).split(","),
            legalEmojies: announcement["LegalEmojies"],
            respondantData: JSON.parse(announcement["RespondantData"]),
            id: Number(announcement["AnnouncementID"]),
            title: announcement["AnnouncementTitle"],
            content: announcement["AnnouncementText"]
        }
    })
}

export interface AnnouncementNaggingData {
    nagWho: Snowflake[],
    originalNagger: Snowflake,
    announcementChannelID: Snowflake,
    announcementMessageID: Snowflake
}

export async function needNaggingData(announcementID: number): Promise<AnnouncementNaggingData> {
    const result = await selectEntry("Announcements", "AnnouncementID=\"" + announcementID + "\"", ["DiscordUserSnowflake", "AnnouncementDiscordChannelSnowflake", "AnnouncementDiscordMessageSnowflake", "NonRespondants"])
    if (!result) throw new Error("Error when fetching nagging data of announcement")
    return {
        nagWho: String(result["NonRespondants"]).split(",").filter(nr => nr !== ""),
        originalNagger: result["DiscordUserSnowflake"],
        announcementChannelID: result["AnnouncementDiscordChannelSnowflake"],
        announcementMessageID: result["AnnouncementDiscordMessageSnowflake"]
    }
}

export interface RespondantData {
    respondant: Snowflake,
    // Time as epoch number
    lastResponseTime: number,
    // Snowflake or name
    lastResponseEmoji: Snowflake | string,
    warningOrError?: string
}

export interface AnnouncementResponseData {
    nonRespondants: Snowflake[],
    legalEmojies: LegalEmoijiesKey,
    respondantData: RespondantData[]
}

export async function needResponseData(announcementMessageID: Snowflake): Promise<AnnouncementResponseData> {
    const result = await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["LegalEmojies", "NonRespondants", "RespondantData"])
    if (!result || !isValidEmojiSetKey(result["LegalEmojies"])) throw new Error("Error when fetching nagging data of announcement " + result)
    return {
        nonRespondants: String(result["NonRespondants"]).split(","),
        legalEmojies: result["LegalEmojies"],
        respondantData: JSON.parse(result["RespondantData"])
    }
}

export interface AnnouncementContentData {
    id: number
    title: string,
    content: string
}

export async function needAllAnnouncementContents(ignoreInactive: boolean = true): Promise<AnnouncementContentData[]> {
    const result = await selectEntries("Announcements", "IsActive=\"" + Number(ignoreInactive) + "\"", ["AnnouncementID", "AnnouncementTitle", "AnnouncementText"])
    return result.map(value => {
        return {
            id: Number(value["AnnouncementID"]),
            title: value["AnnouncementTitle"],
            content: value["AnnouncementText"]
        }
    })
}

export async function needAnnouncementContent(announcementId: string): Promise<AnnouncementContentData> {
    const result = await selectEntry("Announcements", "AnnouncementID=\"" + announcementId + "\"", ["AnnouncementTitle", "AnnouncementText"])
    if (!result) throw new Error("No announcement found with id " + announcementId)
    return {
        id: Number(announcementId),
        title: result["AnnouncementTitle"],
        content: result["AnnouncementText"]
    }
}

// This gets called quite a lot, so we make a primitive in memory cache to avoid having to query the database too much.
// This cache is never invalidated, but updated here as we create new and delete old announcements.
let activeAnnouncementsCache: undefined | string[] = undefined
let inactiveAnnouncementsCache: undefined | string[] = undefined

export async function isActiveAnnouncementMessage(id: Snowflake) {
    if (!activeAnnouncementsCache) {
        const result = await selectEntries("Announcements", "IsActive = true", ["AnnouncementDiscordMessageSnowflake"])

        activeAnnouncementsCache = result.map(e => e["AnnouncementDiscordMessageSnowflake"])
    }

    return activeAnnouncementsCache.includes(id)
}

export async function isInactiveAnnouncementMessage(id: Snowflake) {
    if (!inactiveAnnouncementsCache) {
        const result = await selectEntries("Announcements", "IsActive = false", ["AnnouncementDiscordMessageSnowflake"])

        inactiveAnnouncementsCache = result.map(e => e["AnnouncementDiscordMessageSnowflake"])
    }

    return inactiveAnnouncementsCache.includes(id)
}

export async function removeNonRespondant(announcementMessageID: Snowflake, discordID: Snowflake, singleResponseData: RespondantData) {
    const result = await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["NonRespondants", "RespondantData"])
    if (!result) throw new Error("Error when fetching announcement to add non respondant. " + result)

    let action = false

    const nonRespondants = String(result["NonRespondants"]).split(",").filter(id => {
        if (id === discordID) {
            action = true
            return false
        }
        return true
    }).join(",")

    const respondantData: RespondantData[] = JSON.parse(result["RespondantData"])
    const data = respondantData.find(d => d.respondant === discordID)

    if (!data) {
        respondantData.push(singleResponseData)
    } else {
        respondantData[respondantData.indexOf(data)] = data
    }

    await updateEntry("Announcements",
        "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"",
        ["NonRespondants", "RespondantData"],
        [nonRespondants, JSON.stringify(respondantData)]
    )
    if (!action) throw new Error("User was not in database when trying to remove because of response to announcement")
}

export async function addNonRespondant(announcementMessageID: Snowflake, discordID: Snowflake) {
    const result = await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["NonRespondants", "RespondantData"])
    if (!result) throw new Error("Error when fetching announcement to remove non respondant. " + result)

    const nonRespondants = String(result["NonRespondants"]).split(",")
    if (nonRespondants.includes(discordID)) {
        console.warn("Tried marking user " + discordID + " as not responded but was already in database...")
        return
    }
    nonRespondants.push(discordID)

    const respondantData: RespondantData[] = JSON.parse(result["RespondantData"])
    respondantData.filter(d => d.respondant !== discordID)

    await updateEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["NonRespondants", "RespondantData"], [nonRespondants.join(","), JSON.stringify(respondantData)])
}

export async function switchResponse(announcementMessageID: Snowflake, responseData: RespondantData) {
    const result = await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["RespondantData"])

    const respondantData: RespondantData[] = JSON.parse(result["RespondantData"])
    const dataToUpdate = respondantData.find(d => d.respondant === responseData.respondant)
    if (!dataToUpdate) {
        throw new Error("Could not find response data to update during a response switch for announcemtn " + announcementMessageID)
    }

    respondantData[respondantData.indexOf(dataToUpdate)] = responseData
    await updateEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["RespondantData"], [JSON.stringify(respondantData)])
}

/**
 * Deletes an announcement from the database, only used when removing an announcement before its completed.
 */
export async function deactivateAnnouncement(announcementID: number, messageID: Snowflake) {
    await updateEntry("Announcements", "AnnouncementID=\"" + announcementID + "\"", ["IsActive"], [false])
    activeAnnouncementsCache?.filter(e => e !== messageID)
}
