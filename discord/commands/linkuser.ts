import {addEntry} from "../../database/sqlite.js";
import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
import {update} from "../../main.js";




module.exports = {
    data: new SlashCommandBuilder()
        .setName("linkuser")
        .setDescription("Link a Discord id and a SchedgeUp id")
        .addStringOption(option => option.setName("SchedgeUpId").setRequired(true))
        .addMentionableOption(option => option.setName("DiscordUser").setRequired(true)),
    async execute(interaction: ChatInputCommandInteraction) {
        const schedgeUpId = interaction.options.getString("SchedgeUpId", true)
        const discordUser = interaction.options.getUser("DiscordUser", true)
        await addEntry("UserList", schedgeUpId, discordUser.id)
        await interaction.followUp("User linked, queuing member update for active channels");
        await update(interaction) //TODO: this might be a little excessive?
    }

}