import {addEntry, selectEntry} from "./sqlite.js"

export async function fetchSetting(key: string): Promise<string | undefined> {
    const result = selectEntry("Settings", "SettingKey=\"" + key + "\"", ["SettingValue"])
    if(result === undefined) return undefined
    else return result
}

export async function updateSetting(key: string, value: string) { // TODO: Should trigger a refresh of the necessary code to use the new value
    await addEntry("Settings", "'" + key + "'", "'" + value + "'")
}
