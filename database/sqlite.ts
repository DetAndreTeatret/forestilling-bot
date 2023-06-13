import sqlite3 from "sqlite3";
import {open} from 'sqlite'
import path from "node:path"

sqlite3.verbose() //TODO: enable on startup argument


const db = await open({
    filename: path.join(__dirname, "database.db"),
    driver: sqlite3.cached.Database
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
    await db.exec("CREATE TABLE IF NOT EXISTS Users(DiscordUserSnowflake BIGINT UNSIGNED, SchedgeUpID INT, DisplayName varchar(255))")
    await db.exec("CREATE TABLE IF NOT EXISTS DiscordChannelDeletions(UnixEpoch TIMESTAMP, DiscordChannelSnowflake BIGINT UNSIGNED)")
    await db.exec("CREATE TABLE IF NOT EXISTS DiscordUserRemovals(UnixEpoch TIMESTAMP, DiscordChannelSnowflake BIGINT UNSIGNED, DiscordUserSnowflake BIGINT UNSIGNED)")
}

type DatabaseTables = "Users" | "DiscordChannelDeletions" | "DiscordUserRemovals"

/**
 * Method caller is responsible for the amount and order of params, such that it matches the column layout of the table specified
 * @param table The table to insert an entry into
 * @param params The values of the entry, in the order specified in the Database Layout
 * @see createTables
 */
export async function addEntry(table: DatabaseTables, ...params: string[]) {
    await db.exec("INSERT INTO " + table + " VALUES(" + params + ")")
}

export async function selectEntries(table: DatabaseTables, condition: string, columns?: string[]) {
    const columnString = columns == undefined ? "*" : "(" + columns + ")"
    return await db.get("SELECT * FROM " + table + " WHERE " + condition)
}

