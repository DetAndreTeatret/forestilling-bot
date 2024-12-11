import {
    ChannelType,
    ChatInputCommandInteraction,
    Message,
    SlashCommandBuilder,
    Snowflake, SnowflakeUtil,
    TextChannel
} from "discord.js"


export const data = new SlashCommandBuilder().setName("stats").setDescription("stats")


export async function execute(interaction: ChatInputCommandInteraction) {
    map = new Map()
    const channels = interaction.guild!.channels.cache.values()

    await interaction.reply("doing it")
    const lastYear = new Date()
    lastYear.setFullYear(lastYear.getFullYear() - 1)
    for (const channel of channels) {
        if (channel.type !== ChannelType.GuildText) continue
        const channelForReal = await channel.fetch() as TextChannel
        console.log("Logging channel " + channelForReal.name)
        const messages = channelForReal.messages
        let message = await messages.fetch({limit: 1}).then(messagePage => (messagePage.size === 1 ? messagePage.at(0) : null))

        let amount = 0
        while (message) {
            if (SnowflakeUtil.decode(message.id).timestamp < lastYear.getTime()) {
                // console.log("hit last years messages")
                break
            } else {
                console.log("Fetching nr " + amount + " for channel " + channelForReal.name)
                amount++
            }
            await messages
                .fetch({limit: 100, before: message.id})
                .then(messagePage => {
                    messagePage.forEach(msg => {
                        if (SnowflakeUtil.decode(msg.id).timestamp < lastYear.getTime()) {
                            // console.log(`ignored message at ${new Date(Number(SnowflakeUtil.decode(msg.id).timestamp))}`)
                            return
                        }
                        doStats(msg)
                    })

                    // Update our message pointer to be the last message on the page of messages
                    message = 0 < messagePage.size ? messagePage.at(messagePage.size - 1) : null
                })
        }

        console.dir(map)
    }

    const names = Array.from(map.keys())
    console.log("Result:")
    console.dir(names.sort((name, name2) => cmp(map.get(name)!, map.get(name2)!)).map(name => [name, map.get(name)!]))
}

let map: Map<Snowflake, number> = new Map()

function doStats(message: Message<true>) {
    if (message.author.bot) return
    const b = map.get(message.author.displayName)
    map.set(message.author.displayName, (b === undefined ? 0 : b) + 1)

    // Mld per person (per kanal)
    // topp 10
    // siste år
}

function cmp (a: number, b: number){
    if (isNaN(a) || isNaN(b) || a === b) return 0
    if (a > b) return 1
    if (a < b) return -1
    return 0
}
