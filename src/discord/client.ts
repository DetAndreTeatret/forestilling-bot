import {
    ChatInputCommandInteraction,
    Client,
    ClientOptions,
    Collection,
    Events,
    GatewayIntentBits,
    RepliableInteraction,
    TextChannel
} from "discord.js"
import path from "node:path"
import fs from "node:fs"
import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {STARTING} from "../main.js"
import {handleFoodConversation, handleFoodMessageButtons} from "./food.js"
import {handleFoodOrderButtons} from "./commands/orderfood.js"
import {checkPermission, PermissionLevel} from "./permission.js"
import {fetchFoodOrderByUser, whoOrderedToday} from "../database/food.js"
import {ConsoleLogger} from "../common/logging.js"
import {fileURLToPath} from "url"


export let discordClient: SuperClient
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const logger = new ConsoleLogger("[Discord]")

export class SuperClient extends Client { // TODO look over methods inside/outside Client
    commands = new Collection()

    constructor(options: ClientOptions) {
        super(options)
    }
}

export async function startDiscordClient() {
    const client = new SuperClient({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.DirectMessages]})

    const commandsPath = path.join(__dirname, "commands")
    let commandFiles: string[] = []
    try {
        commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"))
    } catch (e) {
        logger.logWarning("Error reading command files: " + e)
        throw e
    }

    for await (const file of commandFiles) {
        const filePath = path.join(commandsPath, file)
        const command = await import(filePath)

        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command)
        } else {
            logger.logWarning("[WARNING] The command at " + filePath + " is missing a required \"data\" or \"execute\" property.")
        }

    }

    const parsedCommands = Array.from(client.commands.keys())
    logger.logLine("Found " + parsedCommands.length + " Discord commands [" + parsedCommands.join(",") + "]")

    client.once(Events.ClientReady, async c => {
        logger.logLine("Discord client ready! Logged in as " + c.user.tag)
    })

    client.on(Events.Error, console.error)

    await client.login(needEnvVariable(EnvironmentVariable.BOT_TOKEN))

    client.on(Events.InteractionCreate, async function (interaction) {
        if (STARTING) {
            if (interaction.isRepliable()) {
                await (interaction as RepliableInteraction)
                    .reply({
                        content: "Oops! Denne botten er i startup-fasen og må vente litt med å behandle forespørselen din, prøv igjen om litt:sunglasses::+1:",
                        ephemeral: true
                    })
            }
            return
        }

        if (interaction.channel && interaction.isButton()) {
            if (interaction.channel.isDMBased()) {
                await handleFoodMessageButtons(interaction)
            } else {
                await handleFoodOrderButtons(interaction)
            }
            return
        } else if (!interaction.isChatInputCommand()) return

        const command = (interaction.client as SuperClient).commands.get(interaction.commandName)

        if (!command) {
            logger.logWarning("No command matching " + interaction.commandName + " was found.")
            return
        }

        try {
            // We know the type from #isChatInputCommand further up
            const interactionTyped = interaction as ChatInputCommandInteraction

            // Deny commands usage if member is not an admin or bot admin
            if (interactionTyped.member != null) {
                const member = await interactionTyped.guild?.members.fetch(interactionTyped.member.user.id)
                if (member) {
                    // @ts-ignore
                    const permissionLevel: PermissionLevel = ("permissionLevel" in command) ? command.permissionLevel : PermissionLevel.ADMINISTRATOR
                    if (!(await checkPermission(member, permissionLevel))) {
                        await interaction.reply({
                            content: "You do not have permission to use this command >:(\nRequired level: " + permissionLevel,
                            ephemeral: true
                        })
                        return
                    }
                }
            }

            // @ts-ignore the execute function does exist >:(
            await command.execute(interactionTyped)
        } catch (error) {
            console.error(error)
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: "There was an error while executing this command!",
                    ephemeral: true
                })
            } else {
                await interaction.reply({content: "There was an error while executing this command!", ephemeral: true})
            }
        }
    })

    client.on(Events.MessageCreate, async (message) => {
        if (!message.guild && message.author.id !== message.client.user.id) {
            // Direct message
            const foodOrder = await fetchFoodOrderByUser(message.author.id)
            if (foodOrder && message.author.id === foodOrder.ordererSnowflake) {
                // Looks like we are in a conversation with this user
                await handleFoodConversation(message, foodOrder)
            }
        }
    })

    // Try to recover any ongoing food convo
    const maybeOrderer = await whoOrderedToday()
    if (maybeOrderer) {
        const user = await client.users.fetch(maybeOrderer)
        await user.createDM()
    }

    discordClient = client
    return client
}

/**
 * Post a log message to the channel specified in .env DEBUG_CHANNEL_SNOWFLAKE
 */
export async function postUrgentDebug(message: string) {
    if (!discordClient || !discordClient.guilds) await new ConsoleLogger("URGENT").logWarning(message)
    else {
        const guild = await discordClient.guilds.fetch(needEnvVariable(EnvironmentVariable.GUILD_ID))
        const channel = await guild.channels.fetch(needEnvVariable(EnvironmentVariable.DEBUG_CHANNEL_SNOWFLAKE)) as TextChannel

        if (channel) await channel.send(message)
        else await new ConsoleLogger("URGENT").logWarning(message)
    }
}

export async function postDebug(message: string) {
    if (!discordClient || !discordClient.guilds) await new ConsoleLogger("DEBUG").logLine(message) // TODO create these loggers once...
    else {
        const guild = await discordClient.guilds.fetch(needEnvVariable(EnvironmentVariable.GUILD_ID))
        const channel = await guild.channels.fetch(needEnvVariable(EnvironmentVariable.DEBUG_CHANNEL_SNOWFLAKE)) as TextChannel

        if (channel) return await channel.send(message)
        else throw new Error("Where did the debug channel go?")
    }

}

