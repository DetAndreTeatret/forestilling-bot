/**
 * @internal
 */
export function setupConfig() {
    for (const environmentVariableKey in EnvironmentVariable) {
        const result = process.env[environmentVariableKey]
        if (result === undefined || result === "") {
            throw new Error("Env variable with key " + environmentVariableKey + " not found during startup")
        }
    }
    console.log("Config has been initialized!")
}

/**
 * See .env.dist for possible keys
 * @param key
 * @internal
 */
export function needEnvVariable(key: EnvironmentVariable) {
    const result = process.env[key]
    if (result === undefined) {
        throw new Error("Env variable with key " + key + " not found")
    }

    return result
}

export function getEnvVariable(key: string, def: string) {
    const result = process.env[key]
    if (result === undefined) {
        return def
    }

    return result
}

/**
 * @internal
 */
export enum EnvironmentVariable {
    THEATRE_ID = "THEATRE_ID", // TODO can be fetched after first login?
    SCHEDGEUP_EMAIL = "SCHEDGEUP_EMAIL",
    SCHEDGEUP_PASS = "SCHEDGEUP_PASS",
}
