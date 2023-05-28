import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";


module.exports = {
    data: new SlashCommandBuilder().setName("status").setDescription("Bot status"),
    async execute(interaction: ChatInputCommandInteraction){
        await interaction.reply("Up and running!")
    }
}