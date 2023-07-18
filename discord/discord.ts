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
    MessageCreateOptions,
    PermissionsBitField,
    Snowflake,
    TextChannel,
    User
} from 'discord.js'
import path from "node:path";
import fs from "node:fs";
import {Event} from "../scraper/pages/eventAssignement.js"
import {getLinkedDiscordUser} from "../database/user.js";
import {cueUserRemovalFromDiscord} from "../database/discord.js"
import {tomorrow} from "../common/date.js";
import {EnvironmentVariable, needEnvVariable} from "../common/config.js";
import {selectEntry, updateSetting} from "../database/sqlite.js";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISCORD_CHANNEL_TOPIC_FORMAT = "(Do not remove this) ID:%i"

const EVENT_DISCORD_CHANNEL_ID_REGEX = new RegExp("^\\(Do not remove this\\) ID:\\d+$")

export class SuperClient extends Client {
    commands = new Collection()

    //All channels currently managed by this bot
    channelCache: Collection<string, TextChannel> = new Collection()

    constructor(options: ClientOptions) {
            super(options);
    }

    /**
     * Get all currently created channels that should be managed by this bot.
     * The keys in the returned collections are the SchedgeUp event id the channel was created for.
     * @param guild The guild to search for running channels
     */
    public async mapRunningChannels(guild: Guild) {
        const channels = await guild.channels.fetch()
        const runningChannels = new Collection<string, TextChannel>()

        for await (const channel of channels.values()) {
            if(channel === null || channel.type != ChannelType.GuildText) continue

            const textChannel = channel as TextChannel
            if(textChannel.topic === null) continue

            if (EVENT_DISCORD_CHANNEL_ID_REGEX.test(textChannel.topic)) {
                const id = textChannel.topic.split(":")[1]
                runningChannels.set(id, textChannel)
            }
        }

        this.channelCache = runningChannels

        return this.channelCache
    }

    async createNewChannelForEvent(guild: Guild, event: Event) {
        const channel = await guild.channels.create({
            name: event.title,
            type: ChannelType.GuildText,
            topic: DISCORD_CHANNEL_TOPIC_FORMAT.replace("%i", event.id),
            parent: (await getCategory(guild)).id,
        })

        await postEventStatusMessage(channel, event)

        for await (const worker of event.workers) {
            const user = await getLinkedDiscordUser(worker, guild)
            if (user) {
                const fetchedMember = await guild.client.users.fetch(String(user)) //Why javascript :'(
                await addMemberToChannel(channel, fetchedMember)
            } else {
                console.log("Skipped adding Guest user " + worker.who + " to Discord channel " + channel.name)
            }

        }
    }

    /**
     *
     * @param channel
     * @param event The current event to check against, will add users not found in current channel. //TODO: should remove users not found anymore in event?
     */
    async updateMembersForChannel(channel: TextChannel, event: Event) {
        const usersFromDiscord: GuildMember[] = []
        for await (const member of channel.members.values()) {
            usersFromDiscord.push(member)
        }

        const usersFromSchedgeUp: Snowflake[] = []
        for await (const worker of event.workers) {
            const user = await getLinkedDiscordUser(worker, channel.guild)
            if(!user) continue //Guest or not linked...
            usersFromSchedgeUp.push(user)
        }

        //Subtract users already in discord
        const usersToAdd = usersFromSchedgeUp.filter((value) => {
            return !usersFromDiscord.some(member => member.id == value)
        })

        const usersToRemove = usersFromDiscord.filter((value) => {
            return !value.user.bot && !value.permissions.has("Administrator") && !usersFromSchedgeUp.includes(value.id)
        })

        for (let i = 0; i < usersToAdd.length; i++) {
            const user = usersToAdd[i]
            const fetchedMember = await channel.client.users.fetch(String(user)) //Why javascript :'(
            await addMemberToChannel(channel, fetchedMember)
        }

        for await (const user of usersToRemove) {
            if(user.permissions.has("Administrator") || user.user.bot) continue //TODO: add special admin role for this bot, add to channels and dont remove them
            await cueUserRemovalFromDiscord(user.id, channel, tomorrow()) //TODO: Longer?
        }
    }
}

export async function startDiscordClient() {
    const client = new SuperClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences] });

    const commandsPath = path.join(__dirname, 'commands');
    let commandFiles: string[] = []
    try {
        commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
    } catch (e) {
        console.error(e + " WEEE")
    }

    for await (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log("Found Discord command " + command.data.name)
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }

    }
    /*let commands = ""
    client.commands.forEach(name => commands = commands + name + ",")
    console.log("Parsed " + client.commands.size + " Discord commands [" + commands + "]")*/ //TODO

    client.once(Events.ClientReady, c => {
        console.log(`Discord client ready! Logged in as ${c.user.tag}`);
    });

    await client.login(needEnvVariable(EnvironmentVariable.BOT_TOKEN))

    client.on(Events.InteractionCreate, async function(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = (interaction.client as SuperClient).commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            //We know the type from #isChatInputCommand further up
            // @ts-ignore the execute function does exist >:(
            await command.execute(interaction as ChatInputCommandInteraction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({content: 'There was an error while executing this command!', ephemeral: true});
            }
        }
    })

    return client
}

async function getCategory(guild: Guild) {
    const storedCategoryId = await selectEntry("Settings", "SettingKey=\"category_id\"", ["SettingValue"])

    let category: CategoryChannel
    if(storedCategoryId == undefined) {
        //No category yet, create one please
        category = await guild.channels.create({
            name: needEnvVariable(EnvironmentVariable.CHANNEL_CATEGORY_NAME),
            type: ChannelType.GuildCategory,
            permissionOverwrites: [{
                id: guild.roles.everyone,
                deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel]
            }, {
                id: guild.client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }]
        })

        await updateSetting("category_id", category.id)
    } else {
        category = await guild.channels.fetch(storedCategoryId["SettingValue"]) as CategoryChannel
    }

    return category
}

export async function addMemberToChannel(channel: TextChannel, user: User) {
    console.log("Adding member " + user.tag + " to channel " + channel.name)
    await channel.permissionOverwrites.edit(user, {SendMessages: true, ViewChannel: true})
}

export async function removeMemberFromChannel(channel: TextChannel, user: User) {
    console.log("Removing member " + user.tag + " from channel " + channel.name)
    await channel.permissionOverwrites.edit(user, {SendMessages: false, ViewChannel: false})
}

/**
 * Create an event status message for the current channel. If no event info is found in the topic it will ignore the call
 */
async function postEventStatusMessage(channel: TextChannel, event: Event) {
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Kanal for " + event.title)
    embedBuilder.setDescription("Event info")
    const sentMessage = await channel.send({embeds: [embedBuilder]})
    await channel.messages.pin(sentMessage)
    //await channel.messages.react() //TODO set up reactions for food ordering
}

async function sendConfirmationMessage() {
    //TODO: Send message to somebody to confirm creating a new channel or whatever
}

let managerChannel: TextChannel | undefined = undefined

export async function sendManagerMessage(message: MessageCreateOptions, guild: Guild) {
    if(managerChannel == undefined) {
        const storedChannelId = await selectEntry("Settings", "SettingKey=\"manager_channel_id\"", ["SettingValue"])
        let channel: TextChannel

        if(storedChannelId == undefined) {
            //No stored channel, create one please
            channel = await guild.channels.create({
                name: "schedgeup-manager-channel",
                type: ChannelType.GuildText,
                topic: "Used to manage the schedgeup-bot",
                parent: (await getCategory(guild)).id //TODO: give read permissions to admins
            })
            await updateSetting("manager_channel_id", channel.id)
        } else {
            channel = await guild.channels.fetch(storedChannelId["SettingValue"]) as TextChannel
        }
        if(channel != null){
            managerChannel = channel
        } else {
            throw new Error("Manager channel in Discord not found")
        }
    }

    await managerChannel.send(message)
    console.log("[ManagerMessage] " + message.content)
}

export class DiscordCommandError extends Error {
    private where: string;

    constructor(message: string, where: string) {
        super(message);
        this.where = where;
    }
}
