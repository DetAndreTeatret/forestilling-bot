import {AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {fetchAllUsers, fetchUser} from "../../database/user.js"
import {DiscordMessageReplyLogger} from "../../common/logging.js"

export const data = new SlashCommandBuilder()
    .setName("listusers")
    .setDescription("List one or all users")
    .addUserOption(option => option.setName("discord-user").setDescription("The discord user of this user"))
    .addStringOption(option => option.setName("schedgeup-id").setDescription("The SchedgeUp id of this user"))


export async function execute(interaction: ChatInputCommandInteraction) {
    const discordUser = interaction.options.getUser("discord-user")
    const schedgeUpId = interaction.options.getString("schedgeup-id")

    const message = new DiscordMessageReplyLogger(interaction)
    await message.logLine("Fetching user info!")

    let user
    if (discordUser) {
        user = await fetchUser(undefined, discordUser.id)
        if (!user) {
            await message.logLine("User " + discordUser.tag + " does not have a linked account :(")
            return
        }
    } else if (schedgeUpId) {
        user = await fetchUser(schedgeUpId, undefined)
        if (!user) {
            await message.logLine("User " + schedgeUpId + " does not have a linked account :(")
            return
        }
    }

    if (user) {
        const discordMember = await interaction.guild?.members.fetch(user.discordSnowflake)
        await message.logLine("UserID:" + user.userId + ", SchedgeUpID:" + user.schedgeUpId + ", DiscordDisplayName: " + (discordMember === undefined ? "Error fetching discord member" : discordMember.displayName))
    } else {
        await message.logLine("Creating user report...")
        const allUsers = await fetchAllUsers()
        let report = ""
        for await (const databaseUser of allUsers) {
            await message.logPart("Adding user: " + databaseUser.userId + "/" + allUsers.length) // TODO store display name??
            const discordUser = await interaction.guild?.members.fetch(databaseUser.discordSnowflake)
            report += "\nUserID: " + databaseUser.userId + ", SchedgeUpID: " + databaseUser.schedgeUpId + ", DiscordUser: " + (discordUser === undefined ? databaseUser.discordSnowflake : discordUser.displayName)
        }
        const attachmentBuilder = new AttachmentBuilder(Buffer.from(report))
        attachmentBuilder.setName("UserReport.txt")
        attachmentBuilder.setDescription("All linked users")

        interaction.channel?.send({files: [attachmentBuilder]})
    }

}
