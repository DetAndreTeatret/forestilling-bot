import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
import {update} from "../../main.js"


export const data = new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update show channels in Discord(delete/create/update")

export async function execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply("Updating!")
        await update(interaction)
        //await interaction.followUp("Updated!") //TODO: update followup during update
}

