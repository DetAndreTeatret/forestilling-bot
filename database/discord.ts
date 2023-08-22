import {GuildChannel, Snowflake} from "discord.js"
import {addEntry, selectEntries} from "./sqlite.js"

const TWENTY_FOUR_HOURS_MILLISECONDS = 1000 * 60 * 60 * 24

/**
 * Get snowflakes of {@link GuildChannel}s that can be deleted. (System time newer than time stored in database)
 */
export async function getDeleteableChannels(): Promise<Snowflake[]> {
    const columnName = "DiscordChannelSnowflake"
    const result = await selectEntries("ShowDays", "(" + new Date().getTime() + "- ShowStartTimestamp) > " + TWENTY_FOUR_HOURS_MILLISECONDS, [columnName])
    return result.map(value => value[columnName])
}

/**
 * Store a time for when a user can be removed from a {@link GuildChannel}
 */
export async function cueUserRemovalFromDiscord(user: Snowflake, channel: GuildChannel, when: Date) {
    await addEntry("DiscordUserRemovals", String(when.getTime()), channel.id, user)
}

/**
 * Get snowflakes of users that can be removed from the given {@link GuildChannel}. (System time newer than time stored in database)
 *
 * @return an array of member id snowflakes containing all members that can be deleted from the given channel
 */
export async function getRemovableUsers(channel: GuildChannel): Promise<Snowflake[]> {
    const columnName = "DiscordUserSnowflake"
    const result = await selectEntries("DiscordUserRemovals", "DiscordChannelSnowflake=\"" + channel.id + "\" AND UnixEpoch < " + new Date().getTime(), [columnName])
    return result.map(value => value[columnName])
}
