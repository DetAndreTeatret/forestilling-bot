import {
    ChannelType,
    ChatInputCommandInteraction,
    PermissionsBitField,
    SlashCommandBuilder,
} from "discord.js"

export const data = new SlashCommandBuilder().setName("permissions").setDescription("permissions")
export async function execute(interaction: ChatInputCommandInteraction) {
    if(interaction.guild == null) return
    await interaction.reply("Done baby")
    const members = Array.from((await interaction.guild.members.fetch()).values())

    const channels = (await interaction.guild.channels.fetch()).values()

    const channelsMappedToMembers: Map<string, string[]> = new Map<string, string[]>
    const membersMappedToChannels: Map<string, string[]> = new Map<string, string[]>

    for await(const channel of channels) {
        if(channel === null || channel.type === ChannelType.GuildCategory || channel.type === ChannelType.GuildVoice) {
            console.log("bad channel")
            continue
        }
        const memberArray = []
        for await (const member of members) {
            if(channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel, false)) {
                memberArray.push(member.displayName)
                const array = channelsMappedToMembers.get(member.displayName)
                if(array !== undefined) {
                    array.push(channel.name)
                    channelsMappedToMembers.set(member.displayName, array)
                } else {
                    channelsMappedToMembers.set(member.displayName, [channel.name])
                }
            }
        }
        membersMappedToChannels.set(channel.name, memberArray)
    }

    for await (const  entry of channelsMappedToMembers.entries()) {
        console.log(entry[0] + " has access to channels: " + entry[1].toString())
        interaction.channel?.send(entry[0] + " has access to channels: " + entry[1].toString())
    }

    for await (const membersMappedToChannel of membersMappedToChannels) {
        console.log(membersMappedToChannel[0] + " has members: " + membersMappedToChannel[1].toString())
        interaction.channel?.send(membersMappedToChannel[0])
    }
}
