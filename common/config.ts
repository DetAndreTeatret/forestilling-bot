import dotenv from 'dotenv'

dotenv.config()

/**
 * See .env.dist for possible keys
 * @param key
 */
export function needEnvVariable(key: string) {
    const result = process.env[key]
    if(result == undefined) {
        throw new Error("Env variable with key " + key + " not found")
    }

    return result
}