import {ChatInputCommandInteraction, SlashCommandBuilder, TextChannel} from "discord.js"
import {DiscordMessageReplyLogger, Logger} from "../../util/logging.js"
import {getDeleteableChannels} from "../../database/discord.js"
import {deleteEntries} from "../../database/sqlite.js"
import {deleteFoodChannelEntries} from "../../database/food.js"
import {deleteShowGuestsForChannel} from "../../database/user.js"
import {discordClient} from "../client.js"

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
                try {
                        const channel = await discordClient.channels.fetch(channelsToDeleteElement) as TextChannel
                        if (channel != null) {
                                await logger.logLine("Deleting channel " + (channel as TextChannel).name)
                                await channel.delete("Event related to this channel has ended")
                                await deleteEntries("ShowDays", "DiscordChannelSnowflake=\"" + channel.id + "\"")
                                await deleteFoodChannelEntries(channel.id)
                                await deleteShowGuestsForChannel(channel.id)
                        } else {
                                await logger.logWarning("Tried to delete channel found in database but ChannelManager returns null")
                        }
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (e) {
                        // Will error if channel does not exist, is probably left over from some update or other abnormality
                        // Probably safe to delete from database

                        await deleteEntries("ShowDays", "DiscordChannelSnowflake=\"" + channelsToDeleteElement + "\"")
                        await deleteFoodChannelEntries(channelsToDeleteElement)
                        await deleteShowGuestsForChannel(channelsToDeleteElement)
                }
        }
        if (!channelIdsToDelete || channelIdsToDelete.length === 0) await logger.logLine("No channels to delete")

        await logger.logLine("Deletions are done!")

}
