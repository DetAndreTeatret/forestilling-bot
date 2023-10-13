import dotenv from "dotenv"

export function setupConfig() {
    dotenv.config()
    for (const environmentVariableKey in EnvironmentVariable) {
        const result = process.env[environmentVariableKey]
        if (result === undefined || result === "") {
            throw new Error("Env variable with key " + environmentVariableKey + " not found during startup")
        }
    }
}

/**
 * See .env.dist for possible keys
 * @param key
 */
export function needEnvVariable(key: EnvironmentVariable) {
    const result = process.env[key]
    if(result === undefined) {
        throw new Error("Env variable with key " + key + " not found")
    }

    return result
}

export enum EnvironmentVariable {
    BOT_TOKEN = "BOT_TOKEN",
    APPLICATION_ID = "APPLICATION_ID",
    GUILD_ID = "GUILD_ID",
    CHANNEL_CATEGORY_NAME = "CHANNEL_CATEGORY_NAME"
}
