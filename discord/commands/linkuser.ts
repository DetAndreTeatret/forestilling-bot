import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {addNewUser, fetchUser} from "../../database/user.js"
import {DiscordMessageReplyLogger} from "../../util/logging.js"
import {scrapeUsers} from "schedgeup-scraper"

export const data = new SlashCommandBuilder()
    .setName("linkuser")
    .setDescription("Link a Discord id and a SchedgeUp id")
    .addStringOption(option => option.setName("full-name").setDescription("Fullt navn").setRequired(true))
    .addUserOption(option => option.setName("discord-user").setDescription("Discord user").setRequired(true))

export async function execute(interaction: ChatInputCommandInteraction) {
    const fullName = interaction.options.getString("full-name", true).toLowerCase().trim()
    const discordUser = interaction.options.getUser("discord-user", true)
    const user = await fetchUser(fullName, discordUser.id)
    const interactionReply = new DiscordMessageReplyLogger(interaction)
    await interactionReply.logLine("Trying to link user " + fullName + " with " + discordUser.tag)

    if (user) {
        await interactionReply.logLine("User already fully linked!")
        return
    }

    // A completely new user!

    // First check for match on SU
    const schedgeUpUsers = await scrapeUsers()
    const schedgeUpUser = schedgeUpUsers.find(u => u.displayName.toLowerCase().trim() === fullName)

    if (schedgeUpUser) {
        await addNewUser(schedgeUpUser.userId, discordUser.id)
        await interactionReply.logLine("User linked!(" + schedgeUpUser.userId + "(" + schedgeUpUser.displayName + ")/" + discordUser.tag + ")")
    } else {
        await interactionReply.logLine("Could not find any user matching " + fullName)
    }

}
