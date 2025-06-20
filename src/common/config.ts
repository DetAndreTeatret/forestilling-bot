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
    if (result === undefined) {
        throw new Error("Env variable with key " + key + " not found")
    }

    return result
}

export function isDebugEnabled() {
    const result = needEnvVariable(EnvironmentVariable.DEBUG).toLowerCase()

    if (result === "false" || result === "0") return false

    return Boolean(result)
}

export enum EnvironmentVariable {
    DEBUG = "DEBUG",
    BOT_TOKEN = "BOT_TOKEN",
    APPLICATION_ID = "APPLICATION_ID",
    GUILD_ID = "GUILD_ID",
    CHANNEL_CATEGORY_NAME = "CHANNEL_CATEGORY_NAME",
    DEBUG_CHANNEL_SNOWFLAKE = "DEBUG_CHANNEL_SNOWFLAKE",
    FOOD_ORDER_LINK = "FOOD_ORDER_LINK",
    BACKUP_NUMBER_FOOD_ORDER = "BACKUP_NUMBER_FOOD_ORDER",
    HUSANSVARLIG_ROLE_SNOWFLAKE = "HUSANSVARLIG_ROLE_SNOWFLAKE",
    GOOGLE_PROJECT_ID = "GOOGLE_PROJECT_ID",
    EMAIL_ADDRESS_FROM = "EMAIL_ADDRESS_FROM",
    EMAIL_ADDRESS_TO_FOODORDER = "EMAIL_ADDRESS_TO_FOODORDER",
    SMARTSUITE_API_KEY = "SMARTSUITE_API_KEY",
    SMARTSUITE_WORKSPACE_ID = "SMARTSUITE_WORKSPACE_ID",
    SMARTSUITE_BESTILLINGER_TABLE_ID = "SMARTSUITE_BESTILLINGER_TABLE_ID",
    SMARTSUITE_BESTILLINGER_FIELD_ID = "SMARTSUITE_BESTILLINGER_FIELD_ID",
    SHOW_REPORT_LINK = "SHOW_REPORT_LINK",
}
