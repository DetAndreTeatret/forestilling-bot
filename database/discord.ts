import {GuildChannel, Snowflake} from "discord.js";
import {User} from "./user.js";


/**
 * Store a time for when a {@link GuildChannel} can be deleted
 */
export async function queChannelDeletion(channel: GuildChannel, when: Date) {
    //Add point of deletion for given channel(snowflake)
}

/**
 * Get snowflakes of {@link GuildChannel}s that can be deleted. (System time newer than time stored in database)
 */
export async function getDeleteableChannels() {
    //Can we delete the given channel

    const result: Snowflake[] = []

    return result
}

/**
 * Store a time for when a {@link User} can be removed from a {@link GuildChannel}
 */
export async function cueUserRemovalFromDiscord(user: User, channel: GuildChannel, when: Date) {

}

/**
 * Get snowflakes of {@link User}s that can be removed from the given {@link GuildChannel}. (System time newer than time stored in database)
 *
 * @return an array of member id snowflakes containing all members that can be deleted from the given channel
 */
export async function getRemovableUsers(channel: GuildChannel) {
    const result: Snowflake[] = []

    return result
}