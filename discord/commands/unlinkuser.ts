import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {deleteEntries, selectEntry} from "../../database/sqlite.js"


export const data = new SlashCommandBuilder()
    .setName("unlinkuser")
    .setDescription("Unlink some user given either their SchedgeUp id or Discord user")
    .addStringOption(option => option.setName("schedgeup-id").setDescription("Schedgeup id").setRequired(false))
    .addUserOption(option => option.setName("discord-user").setDescription("Discord user").setRequired(false))

export async function execute(interaction: ChatInputCommandInteraction) {
    const schedgeUpId = interaction.options.getString("schedgeup-id")
    const discordUser = interaction.options.getUser("discord-user")
    if(schedgeUpId != null) {
        const entry = await selectEntry("UserList", "SchedgeUpID=\"" + schedgeUpId + "\"")
        if (entry === undefined) {
            await interaction.reply("User with SchedgeUp id `" + schedgeUpId + "` does not have a linked user")
        } else {
            await deleteEntries("UserList", "SchedgeUpID=\"" + schedgeUpId + "\"")
            await interaction.reply("Deleted SchedgeUp user with id `" + schedgeUpId + "` from database")
        }
    } else if (discordUser != null) {
        const entry = await selectEntry("UserList", "DiscordUserSnowflake=\"" + discordUser.id + "\"")
        if (entry === undefined) {
            await interaction.reply("Discord user `" + discordUser.tag + "` does not have a linked user")
        } else {
            await deleteEntries("UserList", "DiscordUserSnowflake=\"" + discordUser.id + "\"")
            await interaction.reply("Deleted Discord user `" + discordUser.tag + "` from database")
        }
    } else {
        await interaction.reply("Provide either a Discord user or a SchedgeUp id! :angry:")
    }
}
