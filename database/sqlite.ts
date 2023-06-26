import sqlite3 from "sqlite3";
import {open} from 'sqlite'
import path from "node:path"
import {fileURLToPath} from "url";

sqlite3.verbose() //TODO: enable on startup argument

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = await open({
    filename: path.join(__dirname, "database.db"),
    driver: sqlite3.cached.Database //TODO: check if this is necessary
})

/** Database layout (C="Column")
 *
 * TABLE 1: Users, C1 DiscordUserSnowflake, C2 SchedgeUpID, C3 Display name(From SU)
 *
 * TABLE 2: DiscordChannelDeletions, C1 UnixEpoch, C2 DiscordChannelSnowflake
 *
 * TABLE 3: DiscordUserRemovals, C1 UnixEpoch, C2 DiscordChannelSnowflake, C3 DiscordUserSnowflake
 *
 */
export async function createTables() {
    await db.exec("CREATE TABLE IF NOT EXISTS DiscordChannelDeletions(UnixEpoch TIMESTAMP, DiscordChannelSnowflake BIGINT UNSIGNED)")
    await db.exec("CREATE TABLE IF NOT EXISTS DiscordUserRemovals(UnixEpoch TIMESTAMP, DiscordChannelSnowflake BIGINT UNSIGNED, DiscordUserSnowflake BIGINT UNSIGNED)")
    await db.exec("CREATE TABLE IF NOT EXISTS UserList(SchedgeUpID INT, DiscordUserSnowflake BIGINT UNSIGNED)")
    await db.exec("CREATE TABLE IF NOT EXISTS SchedgeUpUsers(SchedgeUpID INT, DisplayName varchar(255))") //TODO: Roles, groups
    await db.exec("CREATE TABLE IF NOT EXISTS Settings(SettingKey varchar(60), SettingValue varchar(255))")
    console.log("Database tables up and running")
}

type DatabaseTables = "UserList" | "DiscordChannelDeletions" | "DiscordUserRemovals" | "Settings"

/**
 * Method caller is responsible for the amount and order of params, such that it matches the column layout of the table specified
 * @param table The table to insert an entry into
 * @param params The values of the entry, in the order specified in the Database Layout
 */
export async function addEntry(table: DatabaseTables, ...params: string[]) {
    await db.exec("INSERT INTO " + table + " VALUES(" + params + ")")
}

/**
 * Select some entries from a table. Returns undefined if no entries match condition
 * @param table where to select entries from
 * @param condition the filter condition for choosing entries
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectEntries(table: DatabaseTables, condition: string, columns?: string[]/*TODO: Make this a type? prevent typos*/) {
    const columnString = columns == undefined ? "*" : "(" + columns + ")"
    return await db.all("SELECT " + columnString + " FROM " + table + " WHERE " + condition)
}

/**
 * Select an entry from a table. Returns undefined if no entries match condition
 * @param table where to select entries from
 * @param condition the filter condition for choosing the entry
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectEntry(table: DatabaseTables, condition: string, columns?: string[]) {
    const columnString = columns == undefined ? "*" : "(" + columns + ")"
    return await db.get("SELECT " + columnString + " FROM " + table + " WHERE " + condition)
}

