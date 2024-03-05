import {fileURLToPath} from "url"
import {REST, Routes} from "discord.js"
import fs from "node:fs"
import path from "node:path"
import {EnvironmentVariable, needEnvVariable, setupConfig} from "../common/config.js"

setupConfig()

const commands = []
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const commandsPath = path.join(__dirname, "commands")
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"))
for await (const file of commandFiles) {
    const filePath = path.join(commandsPath, file)
    const command = await import(filePath)
    if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON())
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`)
    }
}

const rest = new REST().setToken(needEnvVariable(EnvironmentVariable.BOT_TOKEN));

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`)

        const data = await rest.put(
            Routes.applicationGuildCommands(needEnvVariable(EnvironmentVariable.APPLICATION_ID), needEnvVariable(EnvironmentVariable.GUILD_ID)),
            {body: commands},
        )
        // @ts-ignore
        console.log(`Successfully reloaded ${data.length} application (/) commands.`)
    } catch (error) {
        console.error(error)
    }
})()
