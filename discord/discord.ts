import dotenv from 'dotenv'
import {
    GatewayIntentBits,
    Client,
    Events,
    Collection,
    ClientOptions,
    ChatInputCommandInteraction,
    Guild, TextChannel, ChannelType
} from 'discord.js'
import path from "node:path";
import fs from "node:fs";

const MAX_CHAR_DISCORD_CHANNEL_NAME = 20

const EVENT_DISCORD_CHANNEL_ID_REGEX = new RegExp("^\\(Do not edit this away\\) ID:\\d+$")

class SuperClient extends Client {
    commands = new Collection()
    //TODO: Some object for accessing SchedgeUp Events so they can be reached in commands

        constructor(options: ClientOptions) {
            super(options);
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

    // Log in to Discord with your client's token
    client.login(process.env['BOT_TOKEN']).then();

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

/**
 * Get all currently created channels that should be managed by this bot.
 * The keys in the returned collections are the SchedgeUp event id the channel was created for.
 * @param guild The guild to search for running channels
 */
async function mapRunningChannels(guild: Guild) {
    const channels = await guild.channels.fetch()
    const runningChannels = new Collection<string, TextChannel>()

    for (let channel of channels.values()) {
        if(channel === null || channel.type != ChannelType.GuildText) continue

        const textChannel = channel as TextChannel
        if(textChannel.topic === null) continue

        if (EVENT_DISCORD_CHANNEL_ID_REGEX.test(textChannel.topic)) {
            const id = textChannel.topic.split(":")[1]
            runningChannels.set(id, textChannel)
        }
    }

    return runningChannels
}

async function createNewChannelForEvent(guild: Guild, schedgeUpId: string) {

}

async function updateMembersForChannel() {

}

async function postEventStatusMessage() {
    //TODO: Pin the message
}

async function editEventStatusMessage() {
    //TODO: Ensure the status message always being the first one sent(before adding users first time?)
}

async function sendConfirmationMessage() {
    //TODO: Send message to somebody to confirm creating a new channel or whatever
}
