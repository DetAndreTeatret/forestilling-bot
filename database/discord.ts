import {GuildChannel} from "discord.js";
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
}

/**
 * Store a time for when a {@link User} can be removed from a {@link GuildChannel}
 */
function cueUserRemovalFromDiscord(user: User, channel: GuildChannel, when: Date) {

}

/**
 * Get snowflakes of {@link User}s that can be removed from the given {@link GuildChannel}. (System time newer than time stored in database)
 */
export async function getRemovableUsers(channel: GuildChannel) {

}