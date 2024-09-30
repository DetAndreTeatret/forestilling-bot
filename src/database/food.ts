import {Snowflake, TextChannel} from "discord.js"
import {addEntry, deleteEntries, executeQuery, selectAllEntires, selectEntry, updateEntry} from "./sqlite.js"
import {fetchShowDayByDate} from "./showday.js"
import {postUrgentDebug} from "../discord/discord.js"

export const NO_CONVERSATION_YET = "not_yet"

export class FoodOrder {
    channelSnowflake: Snowflake
    pickupTime: string
    ordererSnowflake: Snowflake
    mailConvoIDs: string[]
    mailConvoSubject: string
    createdAtDate: Date

    constructor(channelSnowflake: Snowflake, pickupTime: string, whoOrdered: Snowflake, mailConvoIDs: string[], mailConvoSubject: string, createdAtEpoch: number) {
        this.channelSnowflake = channelSnowflake
        this.pickupTime = pickupTime
        this.ordererSnowflake = whoOrdered
        this.mailConvoIDs = mailConvoIDs
        this.mailConvoSubject = mailConvoSubject
        this.createdAtDate = new Date(createdAtEpoch)
    }
}

/**
 * Stores the pickup time for the order for a given channel, effectively keeping track of which channels has already ordered food.
 * @param channel the channel to store the order for
 * @param pickupTime the time the order is to be picked up
 * @param whoOrdered the user that initiated the order, will receive any mail updates from the restaurant
 */
export async function markChannelAsOrdered(channel: TextChannel, pickupTime: string, whoOrdered: Snowflake) {
    const packedString = "\"" + NO_CONVERSATION_YET + "\""
    await addEntry("FoodOrdered", channel.id, pickupTime, whoOrdered, packedString, packedString, Date.now())
}

/**
 * Checks if this channel has ordered.
 * If yes: returns the time the food is scheduled for pickup if any (e.g "1700", "1930")
 * If no: returns {@code undefined}
 * @param channel the channel to check for orders
 */
export async function hasChannelOrdered(channel: Snowflake): Promise<string | undefined> {
    const result = await selectEntry("FoodOrdered", "DiscordChannelSnowflake=\"" + channel + "\"", ["PickupTime"])
    if (result === undefined) return undefined
    return result["PickupTime"]
}

/**
 * Checks which user ordered food for the given channel.
 * @return a discord user snowflake, if the channel does not have an active order {@code undefined} is returned
 */
export async function whoOrderedForChannel(channel: Snowflake): Promise<Snowflake | undefined> {
    const result = await selectEntry("FoodOrdered", "DiscordChannelSnowflake=\"" + channel + "\"")
    if (result === undefined) return undefined
    return result["OrderedByDiscordUserSnowflake"]
}

/**
 * Checks if anyone has ordered food for todays showday.
 * @return a discord user snowflake. If no shows today or no active order for today's show {@code undefined} is returned
 */
export async function whoOrderedToday() {
    const showDay = await fetchShowDayByDate(new Date(), false)
    if (showDay === undefined) return undefined
    const result = await whoOrderedForChannel(showDay.discordChannelSnowflake)

    if (result === undefined) return undefined
    return result
}

/**
 * Call to update conversation info, should be called every time the restaurant replies in the food order convo
 * @param orderer the user which originally ordered the food
 * @param mailConvoID the Message-ID of the first reply
 * @param mailConvoSubject the subject of the mail thread
 */
export async function updateFoodConversation(orderer: Snowflake, mailConvoID: string, mailConvoSubject: string) {
    const result = await selectEntry("FoodOrdered", "OrderedByDiscordUserSnowflake=\"" + orderer + "\"", ["ReferenceTable"])
    if (result === undefined) throw Error("Invalid food convo state, tried to update non-existing convo")
    if (result["ReferenceTable"] === NO_CONVERSATION_YET) {
        const tableID = "MailReferences" + orderer + "_" + Date.now()
        await executeQuery("CREATE TABLE " + tableID + "(Reference varchar)")
        await addEntry(tableID, "\"" + mailConvoID + "\"")
        await updateEntry("FoodOrdered", "OrderedByDiscordUserSnowflake=\"" + orderer + "\"", ["ReferenceTable", "MailConvoSubject"], [tableID, mailConvoSubject])
    } else {
        const tableID = result["ReferenceTable"]
        await addEntry(tableID, "\"" + mailConvoID + "\"")
    }
}

/**
 * Fetch the food order ordered by the given user
 * @param user the user which ordered the food
 * @return if the user has an active order return the order, if no order return {@code undefined}. I
 */
export async function fetchFoodOrderByUser(user: Snowflake) {
    const result = await selectEntry("FoodOrdered", "OrderedByDiscordUserSnowflake=\"" + user + "\"")
    if (result === undefined) return undefined
    let referenceResult
    const referenceTable = result["ReferenceTable"]
    if (referenceTable !== NO_CONVERSATION_YET) {
        referenceResult = (await selectAllEntires(result["ReferenceTable"])).map(r => r["Reference"])
        if (referenceResult.length === 0) postUrgentDebug("Uh oh no mail references found when trying to build mail??")
    } else {
        referenceResult = [""] // TODO Is it possible to retain the thread we started without the restaurant replaying??
    }

    return new FoodOrder(result["DiscordChannelSnowflake"], result["PickupTime"], result["OrderedByDiscordUserSnowflake"], referenceResult, result["MailConvoSubject"], result["CreatedAtEpoch"])
}

/**
 * Fetch today's order
 * @return undefined if there is no shows today or no order has been created yet
 */
export async function fetchTodaysFoodOrder() {
    const showDay = await fetchShowDayByDate(new Date(), false)
    if (showDay === undefined) return undefined
    const result = await selectEntry("FoodOrdered", "DiscordChannelSnowflake=\"" + showDay.discordChannelSnowflake + "\"")
    if (result === undefined) return undefined
    return new FoodOrder(result["DiscordChannelSnowflake"], result["PickupTime"], result["OrderedByDiscordUserSnowflake"], result["MailConvoID"], result["MailConvoSubject"], result["CreatedAtEpoch"])
}

/**
 * Should be called when a channel is deleted to remove the entry from this table as well
 * @param channel the channel that is to be deleted
 */
export async function deleteFoodChannelEntries(channel: Snowflake) {
    const result = await selectEntry("FoodOrdered", "DiscordChannelSnowflake=\"" + channel + "\"")
    if (result === undefined) {
        postUrgentDebug("Could not find table with mail references for old food orders...(trying to delete)")
        return
    }
    await deleteEntries("FoodOrdered", "DiscordChannelSnowflake=\"" + channel + "\"")
    await executeQuery("DROP TABLE " + result["ReferenceTable"])
}
