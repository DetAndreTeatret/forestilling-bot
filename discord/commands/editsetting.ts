import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {fetchSetting, updateSetting} from "../../database/settings.js"


export const data = new SlashCommandBuilder()
    .setName("editsetting")
    .setDescription("Change or view a setting value")
    .addStringOption(option => option.setName("setting-key").setDescription("Key of setting to change/view").setRequired(true))
    .addStringOption(option => option.setName("setting-value").setDescription("New value of setting, if any").setRequired(false))


export async function execute(interaction: ChatInputCommandInteraction) {
    const settingKey = interaction.options.getString("setting-key", true)
    const newSettingValue = interaction.options.getString("setting-value")

    const result = await fetchSetting(settingKey)

    if (newSettingValue == null) {
        if (result === undefined) {
            await interaction.reply("No setting with key " + settingKey + " was found(not initialized?)")
        } else {
            await interaction.reply("Setting with key " + settingKey + " currently has the value: " + result)
        }
    } else {
        await updateSetting(settingKey, newSettingValue)
        await interaction.reply("Value of setting with key " + settingKey + " has been updated to " + newSettingValue)
    }
}
