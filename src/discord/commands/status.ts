import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {EDITION} from "../../main.js"


export const data = new SlashCommandBuilder()
    .setName("status")
    .setDescription("Bot status")
export async function execute(interaction: ChatInputCommandInteraction){
        await interaction.reply("Up and running!\nEdition: " + EDITION)
}
