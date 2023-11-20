import dotenv from "dotenv"
import path from "node:path"
import {JWT} from "google-auth-library"
import appRootPath from "app-root-path"

export let jwt: JWT

export async function setupConfig() {
    dotenv.config()
    for (const environmentVariableKey in EnvironmentVariable) {
        const result = process.env[environmentVariableKey]
        if (result === undefined || result === "") {
            throw new Error("Env variable with key " + environmentVariableKey + " not found during startup")
        }
    }

    const googleKeysFilePath = path.join(appRootPath.toString(), needEnvVariable(EnvironmentVariable.GOOGLE_KEYS_DOCUMENT))
    const keys = await import(googleKeysFilePath, {
        assert: {
            type: "json"
        }
    })

    jwt = new JWT({
        email: keys.client_email,
        key: keys.private_key,
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
        ],
    })
}

/**
 * See .env.dist for possible keys
 * @param key
 */
export function needEnvVariable(key: EnvironmentVariable) {
    const result = process.env[key]
    if (result === undefined) {
        throw new Error("Env variable with key " + key + " not found")
    }

    return result
}

export enum EnvironmentVariable {
    BOT_TOKEN = "BOT_TOKEN",
    APPLICATION_ID = "APPLICATION_ID",
    GUILD_ID = "GUILD_ID",
    CHANNEL_CATEGORY_NAME = "CHANNEL_CATEGORY_NAME",
    GOOGLE_KEYS_DOCUMENT = "GOOGLE_KEYS_DOCUMENT",
    GOOGLE_SPREADSHEET_ID = "GOOGLE_SPREADSHEET_ID"
}
