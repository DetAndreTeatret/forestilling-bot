import {
    CategoryChannel,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    ClientOptions,
    Collection,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    Guild,
    GuildMember,
    Message,
    PermissionsBitField, RepliableInteraction,
    Snowflake,
    TextChannel,
} from "discord.js"
import path from "node:path"
import fs from "node:fs"
import {Event, Worker} from "schedgeup-scraper"
import {getLinkedDiscordUser, getShowGuestsForChannel} from "../database/user.js"
import {formatLength, getDayNameNO, renderDatehhmm} from "../common/date.js"
import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {selectEntry} from "../database/sqlite.js"
import {fileURLToPath} from "url"
import {fetchShowDayBySU} from "../database/showday.js"
import {needSetting, updateSetting} from "../database/settings.js"
import {ConsoleLogger, Logger} from "../common/logging.js"
import {handleFoodOrderButtons} from "./commands/orderfood.js"
import {checkPermission, PermissionLevel} from "./permission.js"
import {fetchFoodOrderByUser, whoOrderedToday} from "../database/food.js"
import {handleFoodConversation, handleFoodMessageButtons} from "./food.js"
import {STARTING} from "../main.js"
import {pickRandomFOHMessage} from "../common/util.js"

export let discordClient: SuperClient

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DISCORD_CHANNEL_TOPIC_FORMAT = "(Do not remove this) ID:%i"

const EVENT_DISCORD_CHANNEL_ID_REGEX = new RegExp("^\\(Do not remove this\\) ID:\\d+R?$")
const DAYTIME_DISCORD_CHANNEL_NAME_SUFFIX = "dagtid"

export class SuperClient extends Client { // TODO look over methods inside/outside SuperClient
    commands = new Collection()

    // Collection of channels mapped to the events they service (SchedgeUpIds)
    channelCache: Collection<TextChannel, string[]> = new Collection<TextChannel, string[]>() // TODO is this actually used?

    constructor(options: ClientOptions) {
        super(options)
    }

    /**
     * Get all currently created channels that should be managed by this bot.
     * The keys in the returned collections are the SchedgeUp event id the channel was created for.
     * @param guild The guild to search for running channels
     */
    public async mapRunningChannels(guild: Guild) {
        const channels = await guild.channels.fetch()
        const runningChannels: Collection<TextChannel, string[]> = new Collection<TextChannel, string[]>()

        for await (const channel of channels.values()) {
            if (channel == null || channel.type !== ChannelType.GuildText) continue

            const textChannel = channel as TextChannel
            if (textChannel.topic === null) continue

            if (EVENT_DISCORD_CHANNEL_ID_REGEX.test(textChannel.topic)) {
                const id = textChannel.topic.split(":")[1]
                const result = await fetchShowDayBySU(id, textChannel.name.includes(DAYTIME_DISCORD_CHANNEL_NAME_SUFFIX))
                if (result) {
                    runningChannels.set(textChannel, result.schedgeUpIds)
                }
            }
        }

        this.channelCache = runningChannels

        return this.channelCache
    }

    /**
     *
     * @param guild
     * @param event
     * @param dayTime Is this channel for daytime events? (barnelørdag osv...)
     * @param logger
     */
    async createNewChannelForEvent(guild: Guild, event: Event, dayTime: boolean, logger: Logger) {
        const channel = await guild.channels.create({
            name: getDayNameNO(event.eventStartTime) + (dayTime ? "-" + DAYTIME_DISCORD_CHANNEL_NAME_SUFFIX : ""),
            type: ChannelType.GuildText,
            topic: DISCORD_CHANNEL_TOPIC_FORMAT.replace("%i", event.id),
            parent: (await getShowsCategory(guild)).id,
        })

        await postEventInfo(channel, event.eventStartTime, event.title)
        await postCastList(channel, [event], dayTime)

        for await (const worker of event.workers) {
            const user = await getLinkedDiscordUser(worker, logger)
            if (user) {
                const fetchedMember = await guild.members.fetch(String(user)) // Why javascript :'(
                await addMemberToChannel(channel, fetchedMember, logger)
            } else if (user === null) {
                await logger.logPart("Skipped adding Guest user " + worker.who + " to Discord channel " + channel.name)
            }

        }

        return channel
    }

    /**
     * @param channel channel to update
     * @param events The current events to check against, will add users not found in current channel.
     * @param logger
     *
     * @return returns all members added to this channel
     */
    async updateMembersForChannel(channel: TextChannel, events: Event[], logger: Logger) {
        await logger.logLine("Updating members for channel " + channel.name + " (" + events.map(e => e.title) + ")")
        const usersFromDiscord: GuildMember[] = []
        for await (const member of channel.members.values()) {
            usersFromDiscord.push(member)
        }

        const usersFromSchedgeUp: Snowflake[] = []
        for (let i = 0; i < events.length; i++) {
            for await (const worker of events[i].workers) {
                const user = await getLinkedDiscordUser(worker, logger)
                // User is null if Guest
                if (user === null) {
                    await logger.logPart("Skipped adding Guest user " + worker.who + " to Discord channel " + channel.name)
                } else if (user !== undefined && !usersFromSchedgeUp.includes(user)) {
                    usersFromSchedgeUp.push(user)
                }
            }
        }


        // Subtract users already in discord
        const usersToAdd = usersFromSchedgeUp.filter((value) => {
            return !usersFromDiscord.some(member => member.id === value)
        })

        const membersAdded: GuildMember[] = []
        for (let i = 0; i < usersToAdd.length; i++) {
            const user = usersToAdd[i]
            const fetchedMember = await channel.guild.members.fetch(String(user)) // Why javascript :'(
            await addMemberToChannel(channel, fetchedMember, logger)
            membersAdded.push(fetchedMember)
        }

        const guestUsersForChannel = await getShowGuestsForChannel(channel.id)

        const usersToRemove = usersFromDiscord.filter((value) => {
            return !usersFromSchedgeUp.includes(value.id) && !guestUsersForChannel.includes(value.id)
        })

        const membersRemoved: GuildMember[] = []
        for await (const member of usersToRemove) {
            if (await checkPermission(member, PermissionLevel.ADMINISTRATOR)) continue
            await logger.logPart("Removing user " + member.displayName + " from channel")
            await removeMemberFromChannel(channel, member, logger)
            membersRemoved.push(member)
        }

        return new ChannelMemberDifference(channel, membersAdded, membersRemoved)
    }
}

export async function startDiscordClient() {
    const client = new SuperClient({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.DirectMessages]})

    const commandsPath = path.join(__dirname, "commands")
    let commandFiles: string[] = []
    try {
        commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"))
    } catch (e) {
        console.error("Error reading command files: " + e)
        throw e
    }

    for await (const file of commandFiles) {
        const filePath = path.join(commandsPath, file)
        const command = await import(filePath)

        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command)
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`)
        }

    }

    const parsedCommands = Array.from(client.commands.keys())
    console.log("Found " + parsedCommands.length + " Discord commands [" + parsedCommands.join(",") + "]")

    client.once(Events.ClientReady, async c => {
        console.log(`Discord client ready! Logged in as ${c.user.tag}`)
    })

    client.on(Events.Error, console.error)

    await client.login(needEnvVariable(EnvironmentVariable.BOT_TOKEN))

    client.on(Events.InteractionCreate, async function (interaction) {
        if (STARTING) {
            if (interaction.isRepliable()) {
                await (interaction as RepliableInteraction)
                    .reply({content: "Oops! Denne botten er i startup-fasen og må vente litt med å behandle forespørselen din, prøv igjen om litt:sunglasses::+1:", ephemeral: true})
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
        }
        else if (!interaction.isChatInputCommand()) return

        const command = (interaction.client as SuperClient).commands.get(interaction.commandName)

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`)
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

async function getShowsCategory(guild: Guild) {
    const storedCategoryId = await selectEntry("Settings", "SettingKey=\"category_id\"", ["SettingValue"])

    let category: CategoryChannel
    if (storedCategoryId !== undefined) {
        category = await guild.channels.fetch(storedCategoryId["SettingValue"]) as CategoryChannel
    } else {
        // No category yet, create one please
        const adminRoleSnowflake = await needSetting("admin_role_snowflake")
        category = await guild.channels.create({
            name: needEnvVariable(EnvironmentVariable.CHANNEL_CATEGORY_NAME),
            type: ChannelType.GuildCategory,
            permissionOverwrites: [{
                id: guild.roles.everyone,
                deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel]
            }, {
                id: guild.client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }, {
                id: adminRoleSnowflake,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }]
        })

        await updateSetting("category_id", category.id)
    }

    return category
}

export async function addMemberToChannel(channel: TextChannel, member: GuildMember, logger: Logger) {
    await logger.logPart("Adding member " + member.displayName + " to channel " + channel.name)
    await channel.permissionOverwrites.edit(member, {SendMessages: true, ViewChannel: true})
}

export async function removeMemberFromChannel(channel: TextChannel, member: GuildMember, logger: Logger) {
    await logger.logPart("Removing member " + member.displayName + " from channel " + channel.name)
    await channel.permissionOverwrites.edit(member, {SendMessages: false, ViewChannel: false})
}

/**
 * Create an event status message for the current channel.
 * If the message has been sent for the given channel it will update the existing message
 */
export async function postEventInfo(channel: TextChannel, eventDate: Date, showTitles: string) {
    const embedToPost = createEventInfoEmbed(eventDate, showTitles)
    const id = "EVENT_STATUS"
    if (SYSTEM_PINNED_MESSAGES_INDEXES.includes(id)) {
        const sentMessage = await channel.send({embeds: [embedToPost]})
        await pinSystemMessage(sentMessage, channel, id)
    } else {
        const pinnedMessage = await fetchSystemMessage(channel, id)
        // Try to avoid updating original message if no titles have changed
        if (pinnedMessage.embeds[0].title!.match(showTitles)) return
        await pinnedMessage.edit({embeds: [embedToPost]})
    }
}

function createEventInfoEmbed(eventDate: Date, shows: string) {
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Kanal for " + getDayNameNO(eventDate) + "s forestillinger(" + shows + ")")
    embedBuilder.setDescription("Velkommen hit! :handshake:\nOBS: Denne kanalen forsvinner når forestillingen(e) er over!")
    embedBuilder.addFields({name: "Husk å bestille mat!", value: needEnvVariable(EnvironmentVariable.FOOD_ORDER_LINK)})
    embedBuilder.setColor("Random")
    embedBuilder.setImage("https://www.detandreteatret.no/uploads/assets/images/Stemning/_800x800_crop_center-center_82_none/andre-teatret-logo.png")

    return embedBuilder
}

/**
 * Post a cast list embed in the given channel, with the workers from the given events
 * If the cast list has been sent for the given channel it will update the existing message
 */
export async function postCastList(channel: TextChannel, events: Event[], daytimeshow: boolean) {
    const map = new Map<Event, Worker[]>()
    for (const event1 of events) {
        map.set(event1, event1.workers)
    }
    const embedToSend = createCastList(map, daytimeshow)
    const id = "CAST_LIST"
    if (SYSTEM_PINNED_MESSAGES_INDEXES.includes(id)) {
        const pinnedMessage = await fetchSystemMessage(channel, id)
        await pinnedMessage.edit({embeds: [embedToSend]})
    } else {
        const message = await channel.send({embeds: [embedToSend]})
        await pinSystemMessage(message, channel, id)
    }
}

const wholeDayRoles = ["Husansvarlig", "Frivillig", "Bar", "Bakvakt"]

/**
 * Create a cast list embed from a list of workers mapped to their respective events
 */
function createCastList(workersAndEvents: Map<Event, Worker[]>, daytimeshow: boolean) {
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Hvem gjør hva i " + (daytimeshow ? "dag" : "kveld") + "?")

    let first = true
    for (const entry of workersAndEvents.entries()) {
        const event = entry[0]
        const workers = entry[1]

        if (first) {
            // First, search for all workers of roles that (probably) always work on all shows in a given show day
            const allWorkers = Array.from(workersAndEvents.values()).flat()
            const allWorkersFiltered: Worker[] = []
            allWorkers.forEach(worker => {
                if (!allWorkersFiltered.some(worker0 => worker0.who === worker.who) && wholeDayRoles.includes(worker.role)) {
                    allWorkersFiltered.push(worker)
                }
            })
            const createWholeDayCastList = createCastEmbedField.bind([allWorkersFiltered, [], embedBuilder])

            const fohCallTime = new Date(event.eventStartTime)
            fohCallTime.setHours(fohCallTime.getHours() - 1)
            if (daytimeshow) {
                fohCallTime.setMinutes(fohCallTime.getMinutes() - 30)
            }

            embedBuilder.addFields({name: "<>-<>-<>" + "Front of House" + "<>-<>-<>", value: pickRandomFOHMessage() + "\nOppmøte " + renderDatehhmm(fohCallTime) + " (1 time før første show)", inline: false})
            wholeDayRoles.forEach(role => createWholeDayCastList(role))

            if (!daytimeshow) {
                fohCallTime.setMinutes(fohCallTime.getMinutes() + 5)
                embedBuilder.setDescription("Fellessamling for alle i denne kanalen på hovedscenen " + renderDatehhmm(fohCallTime) + "\n(55 minutter før første show)")
            }

            first = false
        }

        const addedWorkers: Worker[] = []
        const callTime = "Oppmøte: " + renderDatehhmm(event.eventCallTime)
        const showTime = "Varighet: " + formatLength(event.eventStartTime, event.eventEndTime)
        embedBuilder.addFields({name: "=====\n" + event.title + "\n=====", value: callTime + "\n" + showTime, inline: false})
        const createCastList = createCastEmbedField.bind([workers, addedWorkers, embedBuilder])
        createCastList("Skuespiller")
        createCastList("Lydimprovisatør")
        createCastList("Lysimprovisatør")
        createCastList("Regissør")
        const workersRest = workers.filter(w => !addedWorkers.includes(w))
        const createCastListAgain = createCastEmbedField.bind([workersRest, [], embedBuilder])
        const restRoles = workersRest.map(w => w.role)
        restRoles.filter((item, index) => restRoles.indexOf(item) === index && !wholeDayRoles.includes(item)).forEach(role => {
            createCastListAgain(role)
        })
    }

    return embedBuilder
}

/**
 * this[0] - Collection of all workers yet to use
 * this[1] - Collection of all workers used
 * this[2] - Embed add cast member field to
 * @param role the role to create embed fields from
 */
function createCastEmbedField(this: [Worker[], Worker[], EmbedBuilder], role: string) {
    const workersFiltered = this[0].filter(w => w.role === role)
    if (workersFiltered.length === 0) return
    const workerList = workersFiltered.map(w => w.who).join("\n")
    workersFiltered.forEach(w => this[1].push(w))
    this[2].addFields({name: "**" + role + "**", value: workerList, inline: true})
}

// Used in case a user pins a message in show channel after creation as an offset since pinned messages is fetched with an index
let SYSTEM_PINNED_MESSAGES_AMOUNT = 0

const SYSTEM_PINNED_MESSAGES_INDEXES: string[] = []

async function pinSystemMessage(message: Message, channel: TextChannel, id: string) {
    await channel.messages.pin(message)
    // Since pinned messages are fetched from newest to oldest the indexes have to match this logic (FILO)
    SYSTEM_PINNED_MESSAGES_INDEXES.unshift(id)
    SYSTEM_PINNED_MESSAGES_AMOUNT++
}

async function fetchSystemMessage(channel: TextChannel, id: string) {
    // Pinned messages are fetched from newest to oldest. (First in, last out)
    const pinnedMessages = await channel.messages.fetchPinned()
    const offset = pinnedMessages.size - SYSTEM_PINNED_MESSAGES_AMOUNT
    const message = SYSTEM_PINNED_MESSAGES_INDEXES.indexOf(id)
    const pinnedMessage = pinnedMessages.at(message + offset)
    if (!pinnedMessage) {
        throw new Error("Could not find pinned embed message " + message)
    } else return pinnedMessage
}

/**
 * Contains members added or removed from a channel during an update
 */
export class ChannelMemberDifference {
    channel: TextChannel
    membersAdded: GuildMember[]
    membersRemoved: GuildMember[]

    constructor(channel: TextChannel, membersAdded: GuildMember[], membersRemoved: GuildMember[]) {
        this.channel = channel
        this.membersAdded = membersAdded
        this.membersRemoved = membersRemoved
    }
}

/**
 * Post a log message to the channel specified in .env DEBUG_CHANNEL_SNOWFLAKE
 */
export async function postUrgentDebug(message: string) {
    if (!discordClient) await new ConsoleLogger("URGENT").logWarning(message)
    const guild = await discordClient.guilds.fetch(needEnvVariable(EnvironmentVariable.GUILD_ID))
    const channel = await guild.channels.fetch(needEnvVariable(EnvironmentVariable.DEBUG_CHANNEL_SNOWFLAKE)) as TextChannel

    if (channel) await channel.send(message)
    else await new ConsoleLogger("URGENT").logWarning(message)
}

export async function postDebug(message: string) {
    if (!discordClient) await new ConsoleLogger("URGENT").logWarning(message)
    const guild = await discordClient.guilds.fetch(needEnvVariable(EnvironmentVariable.GUILD_ID))
    const channel = await guild.channels.fetch(needEnvVariable(EnvironmentVariable.DEBUG_CHANNEL_SNOWFLAKE)) as TextChannel

    if (channel) return await channel.send(message)
    else throw new Error("Where did the debug channel go?")
}
