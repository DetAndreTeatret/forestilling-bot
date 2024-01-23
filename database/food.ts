import {Snowflake, TextChannel} from "discord.js"
import {addEntry, deleteEntries, selectEntry, updateEntry} from "./sqlite.js"
import {fetchShowDayByDate} from "./showday.js"

export const NO_CONVERSATION_YET = "\"not_yet\""

export class FoodOrder {
    channelSnowflake: Snowflake
    pickupTime: string
    ordererSnowflake: Snowflake
    mailConvoId: string
    mailConvoSubject: string


    constructor(channelSnowflake: Snowflake, pickupTime: string, whoOrdered: Snowflake, conversationID: string, mailConvoSubject: string) {
        this.channelSnowflake = channelSnowflake
        this.pickupTime = pickupTime
        this.ordererSnowflake = whoOrdered
        this.mailConvoId = conversationID
        this.mailConvoSubject = mailConvoSubject
    }
}

/**
 * Stores the pickup time for the order for a given channel, effectively keeping track of which channels has already ordered food.
 * @param channel the channel to store the order for
 * @param pickupTime the time the order is to be picked up
 * @param whoOrdered the user that initiated the order, will receive any mail updates from the restaurant
 */
export async function markChannelAsOrdered(channel: TextChannel, pickupTime: string, whoOrdered: Snowflake) {
    await addEntry("FoodOrdered", channel.id, pickupTime, whoOrdered, NO_CONVERSATION_YET, NO_CONVERSATION_YET)
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
 * Call to update conversation info, should be called when resturant replies to the initial food order
 * @param orderer the user which originally ordered the food
 * @param mailConvoID the Message-ID of the first reply
 * @param mailConvoSubject the subject of the mail thread
 */
export async function updateFoodConversation(orderer: Snowflake, mailConvoID: string, mailConvoSubject: string) {
    await updateEntry("FoodOrdered", "OrderedByDiscordUserSnowflake=\"" + orderer + "\"", ["MailConvoID", "MailConvoSubject"], [mailConvoID, mailConvoSubject])
}

/**
 * Fetch the food order ordered by the given user
 * @param user the user which ordered the food
 * @return if the user has an active order return the order, if no order return {@code undefined}
 */
export async function fetchFoodOrderByUser(user: Snowflake) {
    const result = await selectEntry("FoodOrdered", "OrderedByDiscordUserSnowflake=\"" + user + "\"")
    if (result === undefined) return undefined
    return new FoodOrder(result["DiscordChannelSnowflake"], result["PickupTime"], result["OrderedByDiscordUserSnowflake"], result["MailConvoID"], result["MailConvoSubject"])
}

/**
 * Should be called when a channel is deleted to remove the entry from this table as well
 * @param channel the channel that is to be deleted
 */
export async function deleteFoodChannelEntries(channel: TextChannel) {
    await deleteEntries("FoodOrdered", "DiscordChannelSnowflake=\"" + channel.id + "\"")
}
