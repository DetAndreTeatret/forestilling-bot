import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
import {update} from "../../main"


module.exports = {
    data: new SlashCommandBuilder().setName("update").setDescription("Updates SchedgeUp Channels in Discord, creating new ones, queuing old ones for removal or updating members in existing ones"),
    async execute(interaction: ChatInputCommandInteraction) {
        await update(interaction)
        await interaction.followUp("Updated!")
    }

}