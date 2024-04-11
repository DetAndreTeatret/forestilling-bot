import {ChatInputCommandInteraction, SlashCommandBuilder, TextChannel} from "discord.js"
import {addShowGuest, deleteShowGuest} from "../../database/user.js"
import {addMemberToChannel, removeMemberFromChannel} from "../discord.js"
import {DummyLogger} from "../../common/logging.js"
import {needNotNullOrUndefined} from "../../common/util.js"


export const data = new SlashCommandBuilder()
    .setName("showgjest")
    .setDescription("Legg til en bruker som gjest i en forestillingskanal(De får komme inn uten å være på SchedgeUp)")
    .addUserOption((option) => option.setName("gjestebruker").setDescription("Brukeren som du vil legge til som gjest").setRequired(true))
    .addChannelOption((option) => option.setName("forestillings-kanal").setDescription("Kanalen som du vil legge de til").setRequired(true))
    .addBooleanOption((option) => option.setName("add-or-remove").setDescription("False hvis du vil gjerne en gjestebruker fra en gitt kanal"))

export async function execute(interaction: ChatInputCommandInteraction) {
    const guestUser = interaction.options.getUser("gjestebruker", true)
    const channel = interaction.options.getChannel("forestillings-kanal", true)
    const addOrRemove = interaction.options.getBoolean("add-or-remove")
    const guild = needNotNullOrUndefined(interaction.guild, "showguest@execute")
    const member = await guild.members.fetch(guestUser)

    if (addOrRemove === false) {
        // Looks like we want to remove a member
        await deleteShowGuest(member.id, channel.id)
        await removeMemberFromChannel(channel as TextChannel, member, new DummyLogger())
        await interaction.reply({content: "Bruker " + guestUser.toString() + " ble fjernet fra kanalen " + channel.toString(), ephemeral: true})
        return
    }

    // Looks like we want to add a member
    const result = await addShowGuest(member.id, channel.id)
    if (result === null) {
        await interaction.reply({content: "Oops! Kanalen " + channel.toString() + " hører ikke til noen forestilling.:woozy_face:", ephemeral: true})
    } else {
        await addMemberToChannel(channel as TextChannel, member, new DummyLogger())
        await interaction.reply({content: "Bruker " + guestUser.toString() + " ble lagt til som gjest i forestillingskanal " + channel.toString(), ephemeral: true})
    }
}
