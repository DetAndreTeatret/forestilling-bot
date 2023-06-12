import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
import {checkDeletions} from "../../main.js";


module.exports = {
    data: new SlashCommandBuilder().setName("delete").setDescription("Check if any channel/member can be deleted/removed from Discord. If yes, delete it/them"),
    async execute(interaction: ChatInputCommandInteraction) {
        await checkDeletions()
        await interaction.followUp("Deleted!")
    }

}