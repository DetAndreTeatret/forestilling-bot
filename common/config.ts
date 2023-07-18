import dotenv from "dotenv";

export function setupConfig() {
    dotenv.config()
    for (const environmentVariableKey in EnvironmentVariable) {
        const result = process.env[environmentVariableKey]
        if (result == undefined) {
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
    if(result == undefined) {
        throw new Error("Env variable with key " + key + " not found")
    }

    return result
}

export enum EnvironmentVariable {
    THEATRE_ID= "THEATRE_ID",
    SCHEDGEUP_EMAIL = "SCHEDGEUP_EMAIL",
    SCHEDGEUP_PASS = "SCHEDGEUP_PASS",
    BOT_TOKEN = "BOT_TOKEN",
    CHANNEL_CATEGORY_NAME = "CHANNEL_CATEGORY_NAME"
}