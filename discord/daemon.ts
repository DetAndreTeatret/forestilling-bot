import {getDeleteableChannels} from "../database/discord.js"
import {deleteEntries} from "../database/sqlite.js"
import {discordClient, removeMemberFromChannel} from "./discord.js"
import {Guild, TextChannel} from "discord.js"
import {update} from "./commands/update.js"
import {fetchSetting, updateSetting} from "../database/settings.js"
import {Logger} from "../common/logging.js"

const ONE_HOUR_MILLISECONDS = 1000 * 60 * 60

export type StringConsumer = (string: string) => Promise<void>

let daemonRunning = false
let interval: number
export async function startDaemon() {
    if(daemonRunning) return
    daemonRunning = true
    let parsedInterval = await fetchSetting("daemon-interval") // Stored in ms
    if(parsedInterval === undefined) {
        const duration = String(ONE_HOUR_MILLISECONDS)
        await updateSetting("daemon-interval", duration)
        parsedInterval = duration
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
        try {
            await update(guild, new Logger(async log => console.log("[update.d] " + log)))
        } catch (error) {
            await console.error("Encountered error during update + " + error)
            throw error
        }
        await checkDeletions(new Logger(async (log) => console.log("[delete.d] " + log)))
    }

    if(daemonRunning) {
        setTimeout(tickDaemon, interval)
    }
}

async function stopDaemon() {
    daemonRunning = false
}

// TODO move to delete.ts? Or move update here
export async function checkDeletions(logger: Logger)  {
    await logger.logLine("Starting check for channels/users to remove...")
    const channelIdsToDelete = await getDeleteableChannels()
    for await (const channelsToDeleteElement of channelIdsToDelete) {
        const channel = await discordClient.channels.fetch(channelsToDeleteElement)
        if(channel != null) {
            await logger.logLine("Deleting channel " + (channel as TextChannel).name)
            channel.delete("Event related to this channel has ended")
            await deleteEntries("ShowDays", "DiscordChannelSnowflake=\"" + channel.id + "\"")
        } else {
            await logger.logLine("Tried to delete channel found in database that does not exist on the Discord server") // TODO warn level on logger?
        }
    }
    if(!channelIdsToDelete || channelIdsToDelete.length === 0) await logger.logLine("No channels to delete")


    // Skip the full #update cycle, just remove channels we've already deleted
    discordClient.channelCache = discordClient.channelCache.filter((ids, channel) => !channelIdsToDelete.includes(channel.id))

    for await (const channelCacheElement of discordClient.channelCache) {
        const channel = channelCacheElement[0]
        // const usersToRemove = await getRemovableUsers(channel)
        const usersToRemove: string[] = [] // TODO Remove if not used again
        for await (const userToRemove of usersToRemove) {
            const discordMember = await channel.guild.members.fetch(userToRemove)
            await removeMemberFromChannel(channel, discordMember, logger)
            await deleteEntries("DiscordUserRemovals", "DiscordChannelSnowflake=\"" + channel.id + "\" AND DiscordUserSnowflake=\"" + discordMember.id + "\"")
        }
        if(!usersToRemove || usersToRemove.length === 0) await logger.logLine("No users to remove")
    }

    await logger.logLine("Deletions are done!")

}
