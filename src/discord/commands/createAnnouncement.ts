import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {createContentModal} from "../../announcement/embedsAndHandlers.js"

export const data = new SlashCommandBuilder()
    .setName("kunngjøring")
    .setDescription("Lag en kunngjøring, maser automatisk på folk som ikke svarer!")

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.showModal(createContentModal())
}
