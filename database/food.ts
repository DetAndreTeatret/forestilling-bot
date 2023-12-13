import {TextChannel} from "discord.js"
import {addEntry, deleteEntries, selectEntry} from "./sqlite.js"

/**
 * Stores the pickup time for the order for a given channel, effectively keeping track of which channels has already ordered food.
 * @param channel the channel to store the order for
 * @param pickupTime the time the order is to be picked up
 */
export async function markChannelAsOrdered(channel: TextChannel, pickupTime: string) {
    await addEntry("FoodOrdered", channel.id, pickupTime)
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
 * Should be called when a channel is deleted to remove the entry from this table as well
 * @param channel the channel that is to be deleted
 */
export async function deleteFoodChannelEntries(channel: TextChannel) {
    await deleteEntries("FoodOrdered", "DiscordChannelSnowflake=\"" + channel.id + "\"")
}
