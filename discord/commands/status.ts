import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {VERSION} from "../../main.js"


export const data = new SlashCommandBuilder()
    .setName("status")
    .setDescription("Bot status")
export async function execute(interaction: ChatInputCommandInteraction){
        await interaction.reply("Version: " + VERSION + "\nUp and running!")
}
