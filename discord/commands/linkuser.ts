import {addEntry, selectEntry} from "../../database/sqlite.js";
import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";

export const data =  new SlashCommandBuilder()
        .setName("linkuser")
        .setDescription("Link a Discord id and a SchedgeUp id")
        .addStringOption(option => option.setName("schedgeup-id").setDescription("Schedgeup id").setRequired(true))
        .addUserOption(option => option.setName("discord-user").setDescription("Discord user").setRequired(true))


export async function execute(interaction: ChatInputCommandInteraction) {
        const schedgeUpId = interaction.options.getString("schedgeup-id", true)
        const discordUser = interaction.options.getUser("discord-user", true)
        const entry = await selectEntry("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordUser.id + "\"")
        if(entry == undefined) {
            await interaction.reply("User already linked") //TODO: select entries, if SU id and Discord ID is two entries
            return
        }
        await addEntry("UserList", schedgeUpId, discordUser.id)
        await interaction.reply("User linked!"); //TODO get display name from SU cache?
    } //TODO: Make this confirm your link("Are you sure you want to link X and Y?")