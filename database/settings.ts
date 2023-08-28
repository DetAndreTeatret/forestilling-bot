import {addEntry, selectEntry} from "./sqlite.js"

export async function fetchSetting(key: string): Promise<string | undefined> {
    const result = await selectEntry("Settings", "SettingKey=\"" + key + "\"", ["SettingValue"])
    if(result === undefined) return undefined
    else return result["SettingValue"]
}

export async function needSetting(key: string) {
    const result = await selectEntry("Settings", "SettingKey=\"" + key + "\"", ["SettingValue"])
    if(result === undefined) throw Error("Needed a value for setting " + key + ", but none was found.")
    else return result["SettingValue"]
}

export async function updateSetting(key: string, value: string) { // TODO: Should trigger a refresh of the necessary code to use the new value
    await addEntry("Settings", "'" + key + "'", "'" + value + "'")
}
