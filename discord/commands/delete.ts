import {ChatInputCommandInteraction, SlashCommandBuilder, TextChannel} from "discord.js"
import {Logger} from "../../common/logging.js"
import {getDeleteableChannels} from "../../database/discord.js"
import {discordClient, removeMemberFromChannel} from "../discord.js"
import {deleteEntries} from "../../database/sqlite.js"
import {editMessage} from "../../common/util.js"



export const data = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Check if any channel/member can be deleted/removed from Discord. If yes, delete it/them")
export async function execute(interaction: ChatInputCommandInteraction) {
        const updateMessage = editMessage.bind([await interaction.reply("Ikke tenk på denne meldingen")])
        const logger = new Logger(updateMessage)
        await logger.logLine("Starting deletion checks!")
        await checkDeletions(logger)
}

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
                        await logger.logWarning("Tried to delete channel found in database that does not exist on the Discord server")
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
                if(!usersToRemove || usersToRemove.length === 0) await logger.logLine("No users to remove from channel: " + channel.name)
        }

        await logger.logLine("Deletions are done!")

}
