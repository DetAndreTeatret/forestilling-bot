import {ChatInputCommandInteraction, SlashCommandBuilder, TextChannel} from "discord.js"
import {DiscordMessageReplyLogger, Logger} from "../../common/logging.js"
import {getDeleteableChannels} from "../../database/discord.js"
import {discordClient} from "../discord.js"
import {deleteEntries} from "../../database/sqlite.js"
import {deleteFoodChannelEntries} from "../../database/food.js"

export const data = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Check if any channels can be deleted from Discord. If yes, delete them")

export async function execute(interaction: ChatInputCommandInteraction) {
        const logger = new DiscordMessageReplyLogger(interaction)
        await logger.logLine("Starting deletion checks!")
        await checkDeletions(logger)
}

export async function checkDeletions(logger: Logger)  {
        await logger.logLine("Starting check for channels to remove...")
        const channelIdsToDelete = await getDeleteableChannels()
        for await (const channelsToDeleteElement of channelIdsToDelete) {
                const channel = await discordClient.channels.fetch(channelsToDeleteElement) as TextChannel
                if (channel != null) {
                        await logger.logLine("Deleting channel " + (channel as TextChannel).name)
                        await channel.delete("Event related to this channel has ended")
                        await deleteEntries("ShowDays", "DiscordChannelSnowflake=\"" + channel.id + "\"")
                        await deleteFoodChannelEntries(channel)
                } else {
                        await logger.logWarning("Tried to delete channel found in database that does not exist on the Discord server")
                }
        }
        if (!channelIdsToDelete || channelIdsToDelete.length === 0) await logger.logLine("No channels to delete")

        // Skip the full #update cycle, just remove channels we've already deleted
        discordClient.channelCache = discordClient.channelCache.filter((ids, channel) => !channelIdsToDelete.includes(channel.id))

        await logger.logLine("Deletions are done!")

}
