import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {addNewUser, fetchUser, updateUser, DatabaseUser} from "../../database/user.js"
import {DiscordMessageReplyLogger} from "../../util/logging.js"
import {scrapeUsers} from "schedgeup-scraper"
import {getPersonnel} from "../../smartsuite/personnel.js"

export const data = new SlashCommandBuilder()
    .setName("linkuser")
    .setDescription("Link a Discord id and a SchedgeUp id")
    .addStringOption(option => option.setName("full-name").setDescription("Fullt navn").setRequired(true))
    .addUserOption(option => option.setName("discord-user").setDescription("Discord user").setRequired(true))

export async function execute(interaction: ChatInputCommandInteraction) {
    const fullName = interaction.options.getString("full-name", true).toLowerCase().trim()
    const discordUser = interaction.options.getUser("discord-user", true)
    const user = await fetchUser(fullName, discordUser.id)
    const message = new DiscordMessageReplyLogger(interaction)
    await message.logLine("Trying to link user " + fullName + " with " + discordUser.tag)

    // Bonus, check for existing record on SS
    const smartSuiteRecords = await getPersonnel()
    const smartSuiteRecord = smartSuiteRecords.find(p => p.name.toLowerCase().trim() === fullName)

    // A user can exist with or without a link to SmartSuite, so we check the exact state.
    if (user !== undefined && user.smartSuiteRecordID) {
        await message.logLine("User already fully linked!")
        return
    } else if (user !== undefined && !user.smartSuiteRecordID && !smartSuiteRecord) {
        await message.logLine("User already linked, but is missing a link to SmartSuite, is there an existing record matching the full name of this user?")
        return
    } else if (user !== undefined && !user.smartSuiteRecordID && smartSuiteRecord) {
        // Update an existing user with new SmartSuite info
        await updateUser(new DatabaseUser(user.userId, user.schedgeUpId, user.discordSnowflake, smartSuiteRecord.recordID), user.schedgeUpId)
        await message.logLine(`Added SmartSuite link to existing user\n(${smartSuiteRecord.name}/[${smartSuiteRecord.roles.join(",")}]/${smartSuiteRecord.recordID})`)
        return
    }

    // A completely new user!

    // First check for match on SU
    const schedgeUpUsers = await scrapeUsers()
    const schedgeUpUser = schedgeUpUsers.find(u => u.displayName.toLowerCase().trim() === fullName)

    if (schedgeUpUser) {
        await addNewUser(schedgeUpUser.userId, discordUser.id, smartSuiteRecord?.recordID)
        await message.logLine("User linked!(" + schedgeUpUser.userId + "(" + schedgeUpUser.displayName + ")/" + discordUser.tag + ")")
        if (smartSuiteRecord) await message.logLine(`Bonus! Found matching SmartSuite Record, linked that as well (${smartSuiteRecord.name}/[${smartSuiteRecord.roles.join(",")}]/${smartSuiteRecord.recordID})`)
    } else {
        await message.logLine("Could not find any user matching " + fullName)
    }

}
