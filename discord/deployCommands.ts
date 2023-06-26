import {fileURLToPath} from "url";
import {CacheType, ChatInputCommandInteraction, REST, Routes, SlashCommandBuilder} from 'discord.js'
import fs from 'node:fs'
import path from 'node:path'

const commands = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsPath = path.join(__dirname, 'commands');

    //@ts-ignore
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

const rest = new REST().setToken("MTEyMTQ2MzIzNjgzMTc0NDAzNA.GMDGnc.mMVEyG7rb2EB_3Ek14j2iemw6Q88XKiDTgQIrY");

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationGuildCommands("1121463236831744034", "710910567958970409"),
            { body: commands },
        );
        //@ts-ignore
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();