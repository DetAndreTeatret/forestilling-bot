import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {addDayTimeShow, removeDayTimeShow} from "../../database/showday.js"


export const data = new SlashCommandBuilder()
    .setName("daytimeshow")
    .setDescription("Add or remove a template id to the list of day time shows")
    .addStringOption(option => option.setName("template-id").setDescription("Template id of show").setRequired(true))
    .addBooleanOption(option => option.setName("remove").setDescription("Should this template id be **removed** from the list? Default is false").setRequired(false))

export async function execute(interaction: ChatInputCommandInteraction) {
    const templateId = interaction.options.getString("template-id", true)
    const remove = interaction.options.getBoolean("remove")

    if(remove) {
        await removeDayTimeShow(templateId)
        await interaction.reply("Removed " + templateId + " from the list of day time shows")
    } else {
        await addDayTimeShow(templateId)
        await interaction.reply("Added " + templateId + " to the list of day time shows")
    }
}
