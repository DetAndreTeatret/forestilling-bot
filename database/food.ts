import {TextChannel} from "discord.js"
import {addEntry, deleteEntries, selectEntry} from "./sqlite.js"

export async function markChannelAsOrdered(channel: TextChannel, orderTime: string) {
    await addEntry("FoodOrdered", channel.id, orderTime)
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
    return result["OrderTime"]
}

export async function deleteFoodChannelEntries(channel: TextChannel) {
    await deleteEntries("FoodOrdered", "DiscordChannelSnowflake=\"" + channel.id + "\"")
}
