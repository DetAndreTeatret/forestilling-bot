import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {addNewUser, fetchUser} from "../../database/user.js"
import {editMessage} from "../../common/util.js"
import {Logger} from "../../common/logging.js"
import {scrapeUsers} from "schedgeup-scraper"

export const data =  new SlashCommandBuilder()
        .setName("linkuser")
        .setDescription("Link a Discord id and a SchedgeUp id")
        .addStringOption(option => option.setName("schedgeup-id").setDescription("Schedgeup id").setRequired(true))
        .addUserOption(option => option.setName("discord-user").setDescription("Discord user").setRequired(true))


export async function execute(interaction: ChatInputCommandInteraction) {
        const schedgeUpId = interaction.options.getString("schedgeup-id", true)
        const discordUser = interaction.options.getUser("discord-user", true)
        const user = await fetchUser(schedgeUpId, discordUser.id)
        const message = new Logger(editMessage.bind([await interaction.reply("Ikke tenk på denne meldingen")]))
        await message.logLine("Trying to link user " + schedgeUpId + " with " + discordUser.tag)
        if(user !== undefined) {
            await message.logLine("User already linked")
            return
        }
        if(schedgeUpId.match(new RegExp("^\\d+$"))) {
            await addNewUser(schedgeUpId, discordUser.id)
            await message.logLine("User linked!(" + schedgeUpId + "/" + discordUser.tag + ")")
        } else {
            // Try to look for matching name...

            const users = await scrapeUsers()
            const user = users.find(u => u.displayName.toLowerCase().trim() === schedgeUpId.toLowerCase().trim())
            if(user) {
                await addNewUser(user.userId, discordUser.id)
                await message.logLine("User linked!(" + user.userId + "(" + user.displayName + ")/" + discordUser.tag + ")")
            } else {
                await message.logLine("Could not find any user matching " + schedgeUpId)
            }
        }
    }
