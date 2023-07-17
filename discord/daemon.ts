import {getDeleteableChannels, getRemovableUsers} from "../database/discord.js";
import {deleteEntries} from "../database/sqlite.js";
import {removeMemberFromChannel} from "./discord.js";
import {discordClient} from "../main.js";


let daemonStarted = false
export function startDaemon() {
    if(daemonStarted) return
    daemonStarted = true
    const interval = 1000 * 60 * 60 * 60 //One hour //TODO - configurable
    console.info("Starting deletion daemon!(Interval: " + (interval / 1000 / 60) + " minutes)")
    setInterval(checkDeletions, interval)
}

export async function checkDeletions()  {
    console.log("Starting check for channels/users to remove...")
    const channelIdsToDelete = await getDeleteableChannels()
    for await (const channelsToDeleteElement of channelIdsToDelete) {
        const channel = await discordClient.channels.fetch(channelsToDeleteElement)
        if(channel != null) {
            channel.delete("Event related to this channel has ended")
            await deleteEntries("DiscordChannelDeletions", "DiscordChannelSnowflake=\"" + channel.id + "\"")
        }
    }

    //Skip the full #update cycle, just remove channels we've already deleted
    discordClient.channelCache = discordClient.channelCache.filter(channel => !channelIdsToDelete.includes(channel.id))

    for await (const channelCacheElement of discordClient.channelCache) {
        const channel = channelCacheElement[1]
        const usersToRemove = await getRemovableUsers(channel)
        for await (const userToRemove of usersToRemove) {
            const discordUser = await channel.guild.members.fetch(userToRemove)
            await removeMemberFromChannel(channel, discordUser.user)
            await deleteEntries("DiscordUserRemovals", "DiscordChannelSnowflake=\"" + channel.id + "\" AND DiscordUserSnowflake=\"" + discordUser.id + "\"")
        }
    }

}