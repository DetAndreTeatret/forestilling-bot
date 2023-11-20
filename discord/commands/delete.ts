import {ChatInputCommandInteraction, SlashCommandBuilder, TextChannel} from "discord.js"
import {Logger} from "../../common/logging.js"
import {getDeleteableChannels} from "../../database/discord.js"
import {discordClient} from "../discord.js"
import {deleteEntries} from "../../database/sqlite.js"
import {editMessage} from "../../common/util.js"
import {cleanupChangeOrderCallbacks} from "../../database/food.js"



export const data = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Check if any channels can be deleted from Discord. If yes, delete them")
export async function execute(interaction: ChatInputCommandInteraction) {
        const updateMessage = editMessage.bind([await interaction.reply("Ikke tenk på denne meldingen")])
        const logger = new Logger(updateMessage)
        await logger.logLine("Starting deletion checks!")
        await checkDeletions(logger)
}

export async function checkDeletions(logger: Logger)  {
        await logger.logLine("Starting check for channels to remove...")
        const channelIdsToDelete = await getDeleteableChannels()
        for await (const channelsToDeleteElement of channelIdsToDelete) {
                const channel = await discordClient.channels.fetch(channelsToDeleteElement)
                if(channel != null) {
                        await logger.logLine("Deleting channel " + (channel as TextChannel).name)
                        await cleanupChangeOrderCallbacks(channel.id)
                        channel.delete("Event related to this channel has ended")
                        await deleteEntries("ShowDays", "DiscordChannelSnowflake=\"" + channel.id + "\"")
                } else {
                        await logger.logWarning("Tried to delete channel found in database that does not exist on the Discord server")
                }
        }
        if(!channelIdsToDelete || channelIdsToDelete.length === 0) await logger.logLine("No channels to delete")

        // Skip the full #update cycle, just remove channels we've already deleted
        discordClient.channelCache = discordClient.channelCache.filter((ids, channel) => !channelIdsToDelete.includes(channel.id))

        await logger.logLine("Deletions are done!")

}
