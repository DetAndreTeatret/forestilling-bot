import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {needNotNullOrUndefined} from "../../common/util.js"
import {fetchAllUsers} from "../../database/user.js"
import {DiscordMessageReplyLogger} from "../../common/logging.js"

const validTypes = ["unlinked"]

export const data = new SlashCommandBuilder()
    .setName("userstats")
    .setDescription("Some stats about users")
    .addStringOption(option => option.setName("stat").setDescription("The stat type to generate").setRequired(true))

export async function execute(interaction: ChatInputCommandInteraction) {
    const statType = interaction.options.getString("stat", true)

    switch (statType) {
        case "unlinked": {
            await unlinkedUserStats(interaction)
            break
        }
        default: {
            await interaction.reply({content: "Stat type \"" + statType + "\" is not a valid type. Valid types are [" + validTypes + "]", ephemeral: true})
        }
    }
}

async function unlinkedUserStats(interaction: ChatInputCommandInteraction) {
    const logger = new DiscordMessageReplyLogger(interaction)
    await logger.logLine("Generating unlinked user stats...")
    const guild = needNotNullOrUndefined(interaction.guild, "unlinkedUserStats#guild")
    const members = Array.from((await guild.members.fetch()).values())
    const users = await fetchAllUsers()
    const unlinkedMembers = members.filter(async m => !users.find(u => u.discordSnowflake === m.id))

    const unlinkedMembersText = unlinkedMembers.map(m => m.user.toString()).join(", ")
    await logger.logLine("Discord users that are currently not linked to an user:")
    await logger.logLine(unlinkedMembersText)

}
