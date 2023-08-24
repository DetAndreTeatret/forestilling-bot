import sqlite3 from "sqlite3"
import {open} from "sqlite"
import path from "node:path"
import {fileURLToPath} from "url"

sqlite3.verbose() // TODO: enable on startup argument

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const db = await open({
    filename: path.join(__dirname, "database.db"),
    driver: sqlite3.cached.Database // TODO: check if cached is necessary
})

export async function createTables() {
    await db.exec("CREATE TABLE IF NOT EXISTS DiscordUserRemovals(UserID INTEGER, UnixEpoch TIMESTAMP, ShowDayID INTEGER)") // TODO Update usage of this table IF ITS USED
    await db.exec("CREATE TABLE IF NOT EXISTS UserList(UserID INTEGER PRIMARY KEY, SchedgeUpID varchar(7), DiscordUserSnowflake varchar(64))")
    await db.exec("CREATE TABLE IF NOT EXISTS Settings(SettingKey varchar(60), SettingValue varchar(255))")
    await db.exec("CREATE TABLE IF NOT EXISTS ShowDays(ShowDayID INTEGER PRIMARY KEY, ShowDayDate DATETEXT, SchedgeUpIDs varchar(7), DiscordChannelSnowflake varchar(64), CreatedAtEpoch TIMESTAMP, DayTimeShows BOOLEAN)")
    console.log("Database tables up and running")
}

type DatabaseTables = "UserList" | "DiscordUserRemovals" | "Settings" | "ShowDays"

/**
 * Method caller is responsible for the amount and order of params, such that it matches the column layout of the table specified
 * @param table The table to insert an entry into
 * @param params The values of the entry, in the order specified in the Database Layout
 */
export async function addEntry(table: DatabaseTables, ...params: any[]) {
    await db.exec("INSERT INTO " + table + " VALUES(" + params + ")")
}

/**
 * Select some entries from a table. Returns undefined if no entries match condition
 * @param table where to select entries from
 * @param condition the filter condition for choosing entries
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectEntries(table: DatabaseTables, condition: string, columns?: string[]/* TODO: Make this a type? prevent typos */) {
    const columnString = columns === undefined ? "*" : "(" + columns + ")"
    const query = "SELECT " + columnString + " FROM " + table + " WHERE " + condition
    debugLogQuery(query)
    return await db.all(query)
}

/**
 * Select an entry from a table. Returns undefined if no entries match condition
 * @param table where to select entries from
 * @param condition the filter condition for choosing the entry
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectEntry(table: DatabaseTables, condition: string, columns?: string[]) {
    const columnString = columns === undefined ? "*" : "(" + columns + ")"
    const query = "SELECT " + columnString + " FROM " + table + " WHERE " + condition
    debugLogQuery(query)
    return await db.get(query)
}

export async function deleteEntries(table: DatabaseTables, condition: string) {
    return await db.exec("DELETE FROM " + table + " WHERE " + condition)
}

export async function updateEntry(table: DatabaseTables, condition: string, column: string, newValue: string) {
    return await db.exec("UPDATE " + table + " SET " + column + "=\"" + newValue + "\"" + "WHERE " + condition)
}

function debugLogQuery(query: string) {
    console.debug("[Debug] Sent SQL Query: " + query)
}

export class SQLError extends Error {
    private query: string

    constructor(message: string, query: string) {
        super(message)
        this.query = query
    }
}
