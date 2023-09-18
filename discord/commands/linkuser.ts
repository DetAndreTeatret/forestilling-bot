import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {addNewUser, fetchUser} from "../../database/user.js"

export const data =  new SlashCommandBuilder()
        .setName("linkuser")
        .setDescription("Link a Discord id and a SchedgeUp id")
        .addStringOption(option => option.setName("schedgeup-id").setDescription("Schedgeup id").setRequired(true))
        .addUserOption(option => option.setName("discord-user").setDescription("Discord user").setRequired(true))


export async function execute(interaction: ChatInputCommandInteraction) {
        const schedgeUpId = interaction.options.getString("schedgeup-id", true)
        const discordUser = interaction.options.getUser("discord-user", true)
        const user = await fetchUser(schedgeUpId, discordUser.id)
        if(user !== undefined) {
            await interaction.reply("User already linked")
            return
        }
        await addNewUser(schedgeUpId, discordUser.id)
        await interaction.reply("User linked!(" + schedgeUpId + "/" + discordUser.tag + ")")
    }
