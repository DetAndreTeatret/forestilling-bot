import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {checkDeletions} from "../daemon.js"
import {editMessage} from "./update.js"
import {Logger} from "../../common/logging.js"



export const data = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Check if any channel/member can be deleted/removed from Discord. If yes, delete it/them")
export async function execute(interaction: ChatInputCommandInteraction) {
        const updateMessage = editMessage.bind([await interaction.reply("Ikke tenk på denne meldingen")])
        const logger = new Logger(updateMessage)
        await logger.logLine("Starting deletion checks!")
        await checkDeletions(logger)
}
