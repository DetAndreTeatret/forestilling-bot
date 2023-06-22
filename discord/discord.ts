import {
    GatewayIntentBits,
    Client,
    Events,
    Collection,
    ClientOptions,
    ChatInputCommandInteraction,
    Guild,
    TextChannel,
    ChannelType,
    GuildMember,
    Snowflake,
    GuildChannel,
    createChannel,
    Message,
    Component,
    GuildBasedChannel, ButtonBuilder, ActionRowBuilder, ActionRow, MessageCreateOptions
} from 'discord.js'
import path from "node:path";
import fs from "node:fs";
import {Event} from "../scraper/pages/eventAssignement.js"
import {getLinkedDiscordUser} from "../database/user.js";
import {cueUserRemovalFromDiscord} from "../database/discord.js"
import {tomorrow} from "../common/date.js";
import {needEnvVariable} from "../common/config.js";
import {selectEntry} from "../database/sqlite";

const MAX_CHAR_DISCORD_CHANNEL_NAME = 20

const DISCORD_CHANNEL_TOPIC_FORMAT = "(Do not remove this) ID:%i"

const EVENT_DISCORD_CHANNEL_ID_REGEX = new RegExp("^\\(Do not remove this\\) ID:\\d+$")

export class SuperClient extends Client {
    commands = new Collection()
    //TODO: Some object for accessing SchedgeUp Events so they can be reached in commands

    //All channels currently managed by this bot
    channelCache: Collection<string, TextChannel> = new Collection()

    managerChannel: TextChannel | undefined = undefined

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

        for (const channel of channels.values()) {
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
            topic: DISCORD_CHANNEL_TOPIC_FORMAT.replace("%i", event.id)
        })

        for (const worker of event.workers) {
            const user = await getLinkedDiscordUser(worker, guild)
            if (user != null) {
                await addMemberToChannel(channel, await guild.members.fetch(user))
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
        const usersFromDiscord: Snowflake[] = []
        for (const member of channel.members.values()) {
            usersFromDiscord.push(member.id)
        }

        const usersFromSchedgeUp: Snowflake[] = []
        for (const worker of event.workers) {
            const user = await getLinkedDiscordUser(worker, channel.guild)
            if(user == null) continue //Guest...
            usersFromSchedgeUp.push(user)
        }

        //Subtract users already in discord
        const usersToAdd = usersFromSchedgeUp.filter((value) => {
            return !usersFromDiscord.includes(value)
        })

        const usersToRemove = usersFromDiscord.filter((value) => {
            return !usersFromSchedgeUp.includes(value)
        })

        for (const user of usersToAdd) {
            await addMemberToChannel(channel, await channel.guild.members.fetch(user))
        }

        for (const user of usersToRemove) {
            await cueUserRemovalFromDiscord(user, channel, tomorrow()) //TODO: Longer?
        }
    }
}

export async function startDiscordClient() {
    const client = new SuperClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildEmojisAndStickers] });

    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts"));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    client.once(Events.ClientReady, c => {
        console.log(`Ready! Logged in as ${c.user.tag}`);
    });

    await client.login(needEnvVariable("BOT_TOKEN"))

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

async function addMemberToChannel(channel: TextChannel, member: GuildMember) {
    await channel.permissionOverwrites.edit(member, {SendMessages: true, ViewChannel: true})
}

async function removeMemberFromChannel(channel: TextChannel, member: GuildMember) {
    await channel.permissionOverwrites.edit(member, {SendMessages: false, ViewChannel: false})
}

/**
 * Create an event status message for the current channel. If no event info is found in the topic it will ignore the call
 */
async function postEventStatusMessage(channel: TextChannel) {
    //TODO: Pin the message
}

async function editEventStatusMessage() {
    //TODO: Ensure the status message always being the first one sent(before adding users first time?)
}

async function sendConfirmationMessage() {
    //TODO: Send message to somebody to confirm creating a new channel or whatever
}

let managerChannel: TextChannel | undefined = undefined

export async function sendManagerMessage(message: MessageCreateOptions, guild: Guild) {
    if(managerChannel == undefined) {
        const storedChannelId = await selectEntry("Settings", "SettingKey=\"manager-channel-id\"", ["SettingValue"])
        let channel: TextChannel
        if(storedChannelId == undefined) {
            //No stored channel, create one please
            channel = await guild.channels.create({
                name: "manager-channel",
                type: ChannelType.GuildText,
                topic: "Used to manage the schedgeup-bot"
            })
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
    console.log("[ManagerMessage] " + message)
}

export class DiscordCommandError extends Error {
    private where: string;

    constructor(message: string, where: string) {
        super(message);
        this.where = where;
    }
}
