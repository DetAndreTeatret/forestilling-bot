import {getDeleteableChannels, getRemovableUsers} from "../database/discord.js"
import {deleteEntries} from "../database/sqlite.js"
import {discordClient, removeMemberFromChannel} from "./discord.js"
import {Guild} from "discord.js"
import {update} from "./commands/update.js"
import {fetchSetting, updateSetting} from "../database/settings.js"


let daemonRunning = false
let interval: number
export async function startDaemon() {
    if(daemonRunning) return
    daemonRunning = true
    const parsedInterval = await fetchSetting("daemon-interval") // Stored in ms
    if(parsedInterval === undefined) {
        await updateSetting("daemon-interval", String(1000 * 60 * 60)) // One hour
    }
    interval = Number(parsedInterval)
    console.info("Starting deletion daemon!(Interval: " + (interval / 1000 / 60) + " minutes)")

    setTimeout(tickDaemon, interval)
}

const guildsToUpdate: Guild[] = []

export function addGuildToUpdate(guild: Guild) {
    if(!guildsToUpdate.includes(guild)) guildsToUpdate.push(guild)
}

async function tickDaemon() {
    for await (const guild of guildsToUpdate) {
        await update(guild, async (log) => console.log("[update.d] " + log))
    }

    await checkDeletions()
    if(daemonRunning) {
        setTimeout(tickDaemon, interval)
    }
}

async function stopDaemon() {
    daemonRunning = false
}

export async function checkDeletions()  {
    console.log("[delete.d] Starting check for channels/users to remove...")
    const channelIdsToDelete = await getDeleteableChannels()
    for await (const channelsToDeleteElement of channelIdsToDelete) {
        const channel = await discordClient.channels.fetch(channelsToDeleteElement)
        if(channel != null) {
            channel.delete("Event related to this channel has ended")
            await deleteEntries("ShowDays", "DiscordChannelSnowflake=\"" + channel.id + "\"")
        } else {
            console.warn("Tried to delete channel found in database that does not exist on the Discord server")
        }
    }

    // Skip the full #update cycle, just remove channels we've already deleted
    discordClient.channelCache = discordClient.channelCache.filter((ids, channel) => !channelIdsToDelete.includes(channel.id))

    for await (const channelCacheElement of discordClient.channelCache) {
        const channel = channelCacheElement[0]
        const usersToRemove = await getRemovableUsers(channel)
        for await (const userToRemove of usersToRemove) {
            const discordUser = await channel.guild.members.fetch(userToRemove)
            await removeMemberFromChannel(channel, discordUser.user)
            await deleteEntries("DiscordUserRemovals", "DiscordChannelSnowflake=\"" + channel.id + "\" AND DiscordUserSnowflake=\"" + discordUser.id + "\"")
        }
    }

    console.log("[delete.d] Deletions are done!")

}
