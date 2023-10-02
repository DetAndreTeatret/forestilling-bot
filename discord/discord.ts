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
    GuildMember, Message,
    PermissionsBitField,
    Snowflake,
    TextChannel,
} from "discord.js"
import path from "node:path"
import fs from "node:fs"
import {Event, Worker} from "schedgeup-scraper"
import {getLinkedDiscordUser} from "../database/user.js"
import {getDayNameNO} from "../common/date.js"
import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {selectEntry} from "../database/sqlite.js"
import {fileURLToPath} from "url"
import {fetchShowDayBySU} from "../database/showday.js"
import {fetchSetting, needSetting, updateSetting} from "../database/settings.js"
import {needNotNullOrUndefined} from "../common/util.js"
import {Logger} from "../common/logging.js"

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
            name: getDayNameNO(event.date) + (dayTime ? "-" + DAYTIME_DISCORD_CHANNEL_NAME_SUFFIX : ""),
            type: ChannelType.GuildText,
            topic: DISCORD_CHANNEL_TOPIC_FORMAT.replace("%i", event.id),
            parent: (await getCategory(guild)).id,
        })

        await postEventInfo(channel, event)
        await postCastList(channel, event.workers)

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

        for (let i = 0; i < usersToAdd.length; i++) {
            const user = usersToAdd[i]
            const fetchedMember = await channel.guild.members.fetch(String(user)) // Why javascript :'(
            await addMemberToChannel(channel, fetchedMember, logger)
        }

        const usersToRemove = usersFromDiscord.filter((value) => {
            return !value.user.bot && !value.permissions.has("Administrator") && !usersFromSchedgeUp.includes(value.id)
        })

        const adminRole = needNotNullOrUndefined(await channel.guild.roles.fetch(await needSetting("admin_role_snowflake")), "adminRole")
        for await (const member of usersToRemove) {
            if (member.permissions.has("Administrator") || member.user.bot || member.roles.cache.some((r, k) => k === adminRole.id)) continue
            await logger.logPart("Removing user " + member.displayName + " from channel")
            await removeMemberFromChannel(channel, member, logger)
            // await cueUserRemovalFromDiscord(user.id, channel, tomorrow())
        }
    }
}

export async function startDiscordClient() {
    const client = new SuperClient({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences]})

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
            console.log("Found Discord command " + command.data.name)
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`)
        }

    }
    /* let commands = ""
    client.commands.forEach(name => commands = commands + name + ",")
    console.log("Parsed " + client.commands.size + " Discord commands [" + commands + "]") */ // TODO

    client.once(Events.ClientReady, async c => {
        console.log(`Discord client ready! Logged in as ${c.user.tag}`)
    })

    await client.login(needEnvVariable(EnvironmentVariable.BOT_TOKEN))

    client.on(Events.InteractionCreate, async function (interaction) {
        if (!interaction.isChatInputCommand()) return

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
                    const adminRole = await fetchSetting("admin_role_snowflake")
                    if (!(member.permissions.has("Administrator") || (adminRole && member.roles.cache.has(adminRole)))) {
                        await interaction.reply({
                            content: "You do not have permission to use my commands >:(",
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

    discordClient = client
    return client
}

async function getCategory(guild: Guild) {
    const storedCategoryId = await selectEntry("Settings", "SettingKey=\"category_id\"", ["SettingValue"])

    let category: CategoryChannel
    if (storedCategoryId === undefined) {
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
    } else {
        category = await guild.channels.fetch(storedCategoryId["SettingValue"]) as CategoryChannel
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
 * Create an event status message for the current channel. If no event info is found in the topic it will ignore the call
 */
async function postEventInfo(channel: TextChannel, event: Event) {
    const embedToPost = createEventInfoEmbed(event.date, event.title)
    const sentMessage = await channel.send({embeds: [embedToPost]})
    await channel.messages.pin(sentMessage)
}

export async function updateShowsInEventInfoMessage(channel: TextChannel, eventDate: Date, showTitles: string) {
    const messages = await channel.messages.fetchPinned()
    const pinnedMessage = findPinnedEmbedMessage(PinnedEmbedMessages.EVENT_STATUS, messages)
    await pinnedMessage.edit({embeds: [createEventInfoEmbed(eventDate, showTitles)]})
}

function createEventInfoEmbed(eventDate: Date, shows: string) {
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Kanal for " + getDayNameNO(eventDate) + "s forestillinger(" + shows + ")")
    embedBuilder.setDescription("Velkommen til denne kanalen, ha en fin uke videre! :sunglasses:\nOBS: Husk at denne kanalen forsvinner når forestillingen er over!")
    embedBuilder.addFields({name: "Husk å bestille mat!", value: "https://bit.ly/DATMAT"})
    embedBuilder.setColor("Random")
    embedBuilder.setImage("https://www.detandreteatret.no/uploads/assets/images/Stemning/_800x800_crop_center-center_82_none/andre-teatret-logo.png")

    return embedBuilder
}

/**
 * Post a cast list embed in the given channel, with the given workers
 */
async function postCastList(channel: TextChannel, workers: Worker[]) {
    const embedBuilder = createCastList(workers)
    const message = await channel.send({embeds: [embedBuilder]})
    await channel.messages.pin(message)
}

/**
 * Update the cast list in a given channel, will replace the whole cast with the given workers
 */
export async function updateCastList(channel: TextChannel, workers: Worker[]) {
    const messages = await channel.messages.fetchPinned()
    const pinnedMessage = findPinnedEmbedMessage(PinnedEmbedMessages.CAST_LIST, messages)
    await pinnedMessage.edit({embeds: [createCastList(workers)]})
}

/**
 * Create a cast list embed from a list of workers
 */
function createCastList(workers: Worker[]) {
    const embedBuilder = new EmbedBuilder()
    const addedWorkers: Worker[] = []
    embedBuilder.setTitle("Hvem gjør hva i kveld?")
    const createCastList = createCastEmbedField.bind([workers, addedWorkers, embedBuilder])
    createCastList("Husansvarlig")
    createCastList("Frivillig")
    createCastList("Skuespiller")
    createCastList("Lydimprovisatør")
    createCastList("Lysimprovisatør")
    createCastList("Regissør")
    const workersRest = workers.filter(w => !addedWorkers.includes(w))
    const createCastListAgain = createCastEmbedField.bind([workersRest, [], embedBuilder])
    const restRoles = workersRest.map(w => w.role)
    restRoles.filter((item, index) => restRoles.indexOf(item) === index).forEach(role => {
        createCastListAgain(role)
    })

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
    if(workersFiltered.length === 0) return
    const workerList = workersFiltered.map(w => w.who).join("\n")
    workersFiltered.forEach(w => this[1].push(w))
    this[2].addFields({name: role, value: workerList, inline: true})
}

function createFoodOrderMessage() {
    const embedBuilder = new EmbedBuilder()
}

function findPinnedEmbedMessage(message: PinnedEmbedMessages, pinnedMessages: Collection<string, Message<true>>) {
    const pinnedMessage = pinnedMessages.at(message)
    if (!pinnedMessage) {
        throw new Error("Could not find pinned embed message " + message)
    } else return pinnedMessage
}

/**
 * Pinned messages are fetched from newest to oldest. (First in, last out)
 */
enum PinnedEmbedMessages {
    FOOD_ORDER,
    CAST_LIST,
    EVENT_STATUS
}

export class DiscordCommandError extends Error {
    private where: string

    constructor(message: string, where: string) {
        super(message)
        this.where = where
    }
}
