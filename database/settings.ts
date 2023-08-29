import {addEntry, selectEntry, updateEntry} from "./sqlite.js"

/**
 * Fetch a setting value, returns undefined if no value for the given key is stored
 * @param key the setting key
 */
export async function fetchSetting(key: string): Promise<string | undefined> {
    const result = await selectEntry("Settings", "SettingKey=\"" + key + "\"", ["SettingValue"])
    if(result === undefined) return undefined
    else return result["SettingValue"]
}

/**
 * Fetch a setting value, throws an {@link Error} if no value for the given key is stored
 * @param key the setting key
 */
export async function needSetting(key: string) {
    const result = await fetchSetting(key)
    if(result === undefined) throw Error("Needed a value for setting " + key + ", but none was found.")
    else return result
}

/**
 * Updates a setting value, if there is no value stored for the given key it creates a new database entry, if there already is an entry
 * it is updated with the new given value.
 * @param key the setting key
 * @param value the new setting value
 */
export async function updateSetting(key: string, value: string) { // TODO: Should trigger a refresh of the necessary code to use the new value
    const result = await fetchSetting(key)
    if(result === undefined) {
        await addEntry("Settings", "'" + key + "'", "'" + value + "'")
    } else {
        await updateEntry("Settings", "SettingKey=\"" + key + "\"", "SettingValue", value)
    }
}
