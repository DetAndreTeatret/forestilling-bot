import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {addDayTimeShow, fetchAllDayTimeShows, isDayTimeShow, removeDayTimeShow} from "../../database/showday.js"


export const data = new SlashCommandBuilder()
    .setName("daytimeshow")
    .setDescription("Edit the list of template ids/show names of day time shows, leave empty to display list")
    .addStringOption(option => option.setName("template-id-or-show-name").setDescription("Template id or name of show"))
    .addBooleanOption(option => option.setName("remove").setDescription("Should this template id or name be **removed** from the list? Default is false"))

export async function execute(interaction: ChatInputCommandInteraction) {
    const templateIdOrShowName = interaction.options.getString("template-id-or-show-name")
    const remove = interaction.options.getBoolean("remove")

    if (!templateIdOrShowName) {
        const shows = await fetchAllDayTimeShows()
        if (shows.length === 0) {
            await interaction.reply("No shows stored as day time shows")
        } else await interaction.reply("All current day time shows template ids/show names:\n" + shows.join(", "))
    } else if (remove) {
        if (await isDayTimeShow(templateIdOrShowName, "null")) {
            await removeDayTimeShow(templateIdOrShowName)
            await interaction.reply("Removed " + templateIdOrShowName.toLowerCase() + " from the list of day time shows")
        } else {
            await interaction.reply("That template id or show name is **not** registered in the list!")
        }

    } else {
        if (await isDayTimeShow(templateIdOrShowName, "null")) {
            await interaction.reply("That template id or show name **is already** registered in the list!")
        } else {
            await addDayTimeShow(templateIdOrShowName)
            await interaction.reply("Added " + templateIdOrShowName.toLowerCase() + " to the list of day time shows")
        }
    }
}
