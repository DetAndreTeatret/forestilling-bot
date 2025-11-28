import {GuildChannel, Snowflake} from "discord.js"
import {addEntry, deleteEntries, selectAllEntires, selectEntries, selectEntry, updateEntry} from "./sqlite.js"
import {renderDateYYYYMMDD} from "../util/date.js"
import {
    Announcement,
    isValidEmojiSetKey,
    isValidNaggingKey,
    LegalEmoijiesKey,
    NaggingRulesKey
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
    await addEntry("Announcements", id, announcement.owner.id, announcement.channel.id, messageID, announcement.title, announcement.content, needNotNullOrUndefined(announcement.legalEmojies, "createAnnouncement#legalEmojies"), needNotNullOrUndefined(announcement.naggingRule, "createAnnouncement#naggingRule"), resolvedNaggers.join(","))
}

export async function editAnnouncement(data: AnnouncementContentData) {
    await updateEntry("Announcements", "AnnouncementID=\"" + data.id + "\"", ["AnnouncementTitle", "AnnouncementText"], [data.title, data.content])
}

export async function needAnnouncementData(announcementID: number): Promise<AnnouncementNaggingData & AnnouncementResponseData & AnnouncementContentData> {
    const result = await selectEntry("Announcements", "AnnouncementID=\"" + announcementID + "\"")
    if (!result || !isValidNaggingKey(result["NaggingPlan"]) || !isValidEmojiSetKey(result["LegalEmojies"])) throw new Error("Error when fetching data of announcement " + result)
    return {
        naggingRulesKey: result["NaggingPlan"],
        nagWho: String(result["NonRespondants"]).split(","),
        originalNagger: result["DiscordUserSnowflake"],
        announcementChannelID: result["AnnouncementDiscordChannelSnowflake"],
        announcementMessageID: result["AnnouncementDiscordMessageSnowflake"],
        nonRespondants: String(result["NonRespondants"]).split(","),
        legalEmojies: result["LegalEmojies"],
        id: Number(result["AnnouncementID"]),
        title: result["AnnouncementTitle"],
        content: result["AnnouncementText"]
    }
}

export interface AnnouncementNaggingData {
    naggingRulesKey: NaggingRulesKey,
    nagWho: Snowflake[],
    originalNagger: Snowflake,
    announcementChannelID: Snowflake,
    announcementMessageID: Snowflake
}

export async function needNaggingData(announcementID: number): Promise<AnnouncementNaggingData> {
    const result = await selectEntry("Announcements", "AnnouncementID=\"" + announcementID + "\"", ["DiscordUserSnowflake", "AnnouncementDiscordChannelSnowflake", "AnnouncementDiscordMessageSnowflake", "NaggingPlan", "NonRespondants"])
    if (!result || !isValidNaggingKey(result["NaggingPlan"])) throw new Error("Error when fetching nagging data of announcement " + result)
    return {
        naggingRulesKey: result["NaggingPlan"],
        nagWho: String(result["NonRespondants"]).split(","),
        originalNagger: result["DiscordUserSnowflake"],
        announcementChannelID: result["AnnouncementDiscordChannelSnowflake"],
        announcementMessageID: result["AnnouncementDiscordMessageSnowflake"]
    }
}

export interface AnnouncementResponseData {
    nonRespondants: Snowflake[],
    legalEmojies: LegalEmoijiesKey,
}

export async function needResponseData(announcementMessageID: Snowflake): Promise<AnnouncementResponseData> {
    const result = await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["LegalEmojies", "NonRespondants"])
    if (!result || !isValidEmojiSetKey(result["LegalEmojies"])) throw new Error("Error when fetching nagging data of announcement " + result)
    return {
        nonRespondants: String(result["NonRespondants"]).split(","),
        legalEmojies: result["LegalEmojies"]
    }
}

export interface AnnouncementContentData {
    id: number
    title: string,
    content: string
}

export async function needAllAnnouncementContents(): Promise<AnnouncementContentData[]> {
    const result = await selectAllEntires("Announcements", ["AnnouncementID", "AnnouncementTitle", "AnnouncementText"])
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

// TODO needs cache...
export async function isAnnouncementMessage(id: Snowflake) {
    return await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + id + "\"") !== undefined
}

export async function removeNonRespondant(announcementMessageID: Snowflake, discordID: Snowflake) {
    const result = await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["NonRespondants"])
    if (!result) throw new Error("Error when fetching announcement to add non respondant. " + result)

    const current = String(result["NonRespondants"]).split(",")
    let action = false
    await updateEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["NonRespondants"], [current.filter(id => {
        if (id === discordID) {
            action = true
            return false
        } return true
    }).join(",")])
    if (!action) throw new Error("User was not in database when trying to remove because of response to announcement")
}

export async function addNonRespondant(announcementMessageID: Snowflake, discordID: Snowflake) {
    const result = await selectEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["LegalEmojies", "NonRespondants"])
    if (!result) throw new Error("Error when fetching announcement to remove non respondant. " + result)

    const current = String(result["NonRespondants"]).split(",")
    if (current.includes(discordID)) {
        console.warn("Tried marking user " + discordID + " as not responded but was already in database...")
        return
    }
    current.push(discordID)
    await updateEntry("Announcements", "AnnouncementDiscordMessageSnowflake=\"" + announcementMessageID + "\"", ["NonRespondants"], [current.join(",")])
}

/**
 * Deletes an announcement from the database, only used when removing an announcement before its completed.
 * @param announcementID
 */
export async function deleteAnnouncement(announcementID: number) {
    await deleteEntries("Announcements", "AnnouncementID=\"" + announcementID + "\"")
}
