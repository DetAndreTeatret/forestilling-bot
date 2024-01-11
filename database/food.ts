import {Snowflake, TextChannel} from "discord.js"
import {addEntry, deleteEntries, selectEntry} from "./sqlite.js"
import {fetchShowDayByDate} from "./showday.js"

/**
 * Stores the pickup time for the order for a given channel, effectively keeping track of which channels has already ordered food.
 * @param channel the channel to store the order for
 * @param pickupTime the time the order is to be picked up
 * @param whoOrdered the user that initiated the order, will receive any mail updates from the restaurant
 */
export async function markChannelAsOrdered(channel: TextChannel, pickupTime: string, whoOrdered: Snowflake) {
    await addEntry("FoodOrdered", channel.id, pickupTime, whoOrdered)
}

/**
 * Checks if this channel has ordered.
 * If yes: returns the time the food is scheduled for pickup if any (e.g "1700", "1930")
 * If no: returns {@code undefined}
 * @param channel the channel to check for orders
 */
export async function hasChannelOrdered(channel: TextChannel): Promise<string | undefined> {
    const result = await selectEntry("FoodOrdered", "DiscordChannelSnowflake=\"" + channel.id + "\"")
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
 * Should be called when a channel is deleted to remove the entry from this table as well
 * @param channel the channel that is to be deleted
 */
export async function deleteFoodChannelEntries(channel: TextChannel) {
    await deleteEntries("FoodOrdered", "DiscordChannelSnowflake=\"" + channel.id + "\"")
}
