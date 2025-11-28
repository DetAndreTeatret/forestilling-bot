import {
    Client,
    ClientOptions,
    Collection,
    Events,
    GatewayIntentBits,
    Guild, MessageFlagsBitField,
    RepliableInteraction, Snowflake,
    TextChannel
} from "discord.js"
import path from "node:path"
import fs from "node:fs"
import {EnvironmentVariable, needEnvVariable} from "../util/config.js"
import {STARTING} from "../main.js"
import {handleFoodConversation, handleFoodMessageButtons} from "./food.js"
import {handleFoodOrderButtons} from "./commands/orderfood.js"
import {checkPermission, PermissionLevel} from "./permission.js"
import {fetchFoodOrderByUser, whoOrderedToday} from "../database/food.js"
import {ConsoleLogger} from "../util/logging.js"
import {fileURLToPath} from "url"
import {
    handleAnnouncementReaction,
    handleAnnouncementTextSubmit, handleAnnouncementWorkButton,
    handleAnnouncementWorkMenuSelect
} from "./commands/announcement/create.js"
import {isAnnouncementMessage} from "../database/discord.js"
import {
    handleAnnouncementEditButton,
    handleAnnouncementEditRequest,
    handleAnnouncementEditSubmit
} from "./commands/announcement/edit.js"


export let discordClient: SuperClient
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const logger = new ConsoleLogger("[Discord]")

// Some stuff needed for typing since we do the reaction events through the RAW event, can't get the reaction event to work
const DISCORD_RAW_REACTION_EVENTS = ["MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE", "MESSAGE_REACTION_REMOVE_ALL"] as const
// This is typed this way such that we can pass the events to the same handler in the announcement code, instead of doing three separate functions
export type DiscordEmojiEvent =
    {type: typeof DISCORD_RAW_REACTION_EVENTS[0] | typeof DISCORD_RAW_REACTION_EVENTS[1], name: string | null, id: Snowflake | null}
    |
    {type: typeof DISCORD_RAW_REACTION_EVENTS[2], name: undefined, id: undefined}

export class SuperClient extends Client { // TODO look over methods inside/outside Client
    commands = new Collection() // TODO can be stronger typed
    guild!: Guild // Just don't fetch it too early...

    constructor(options: ClientOptions) {
        super(options)
    }

    // Call this after login
    async populateGuild() {
        this.guild = await this.guilds.fetch(needEnvVariable(EnvironmentVariable.GUILD_ID))
    }
}

export async function startDiscordClient() {
    const client = new SuperClient({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions]})

    const commandsPath = path.join(__dirname, "commands")
    let commandFiles: string[] = []
    try {
        commandFiles = fs.readdirSync(commandsPath, {recursive: true, encoding: "utf-8"}).filter(file => file.endsWith(".js"))
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

    await client.populateGuild()

    client.on(Events.Raw, e => {
        if (!STARTING && e.d.guild_id === discordClient.guild.id) {
            if (e.t === DISCORD_RAW_REACTION_EVENTS[0] && e.d.member.user && !e.d.member.user.bot) {
                isAnnouncementMessage(e.d.message_id).then(() => {
                    handleAnnouncementReaction(e.d.message_id, e.d.channel_id, {
                        type: e.t,
                        id: e.d.emoji.id,
                        name: e.d.emoji.name
                    }, e.d.member.user.id)
                })
            }

            if (e.t === DISCORD_RAW_REACTION_EVENTS[1]) {
                isAnnouncementMessage(e.d.message_id).then(() => {
                    handleAnnouncementReaction(e.d.message_id, e.d.channel_id, {
                        type: e.t,
                        id: e.d.emoji.id,
                        name: e.d.emoji.name
                    }, e.d.user_id)
                })
            }
        }
    })

    client.on(Events.InteractionCreate, async function (interaction) {
        if (STARTING) {
            if (interaction.isRepliable()) {
                await (interaction as RepliableInteraction)
                    .reply({
                        content: "Oops! Denne botten er i startup-fasen og må vente litt med å behandle forespørselen din, prøv igjen om litt:sunglasses::+1:",
                        flags: MessageFlagsBitField.Flags.Ephemeral
                    })
            }
            return
        }

        if (interaction.channel && interaction.isButton()) {
            const path = interaction.customId.split("-")
            if (path[1] !== "button") throw new Error("Faulty custom ID in button click" + path[1])
            switch (path[0]) {
                case "food": {
                    await handleFoodOrderButtons(interaction) // TODO this and foodorder uses wrong schema for custom id, misses component type identifier on second index
                    break
                }
                case "foodOrder": {
                    await handleFoodMessageButtons(interaction)
                    break
                }
                case "announcement": {
                    await handleAnnouncementWorkButton(interaction)
                    break
                }
                case "announcementEdit": {
                    await handleAnnouncementEditButton(interaction)
                    break
                }
            }
            return
        }

        if (interaction.isModalSubmit()) {
            const path = interaction.customId.split("-")
            if (path[1] !== "modal") throw new Error("Faulty custom ID in modal submit" + path[1])
            switch (path[0]) {
                case "announcement": {
                    await handleAnnouncementTextSubmit(interaction)
                    break
                }
                case "announcementEdit": {
                    await handleAnnouncementEditSubmit(interaction)
                    break
                }
            }
            return
        }

        if (interaction.isAnySelectMenu()) {
            const path = interaction.customId.split("-")
            if (path[1] !== "picker") throw new Error("Faulty custom ID in select menu" + path[1])
            switch (path[0]) {
                case "announcement": {
                    await handleAnnouncementWorkMenuSelect(interaction)
                    break
                }
                case "announcementEdit": {
                    await handleAnnouncementEditRequest(interaction)
                    break
                }
            }
            return
        }

        // Any interaction that is not a chat command has to be handled BEFORE this check
        if (!interaction.isChatInputCommand()) return

        const command = (interaction.client as SuperClient).commands.get(interaction.commandName)

        if (!command) {
            logger.logWarning("No command matching " + interaction.commandName + " was found.")
            return
        }

        try {
            // Deny commands usage if member is not an admin or bot admin
            if (interaction.member != null) {
                const member = await interaction.guild?.members.fetch(interaction.member.user.id)
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

            // @ts-expect-error the execute function does not exist
            await command.execute(interaction)
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

