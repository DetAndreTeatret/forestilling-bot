import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
import {update} from "./../../main.js"


module.exports = {
    data: new SlashCommandBuilder().setName("update").setDescription("Updates SchedgeUp Channels in Discord, creating new ones, removing old ones or updating members in existing ones"),
    async execute(interaction: ChatInputCommandInteraction) {
        await update(interaction)
        await interaction.followUp("Updated!")
    }

}