import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {checkDeletions} from "../daemon.js"



export const data = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Check if any channel/member can be deleted/removed from Discord. If yes, delete it/them")
export async function execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply("Started deletion checks!")
        await checkDeletions()
}