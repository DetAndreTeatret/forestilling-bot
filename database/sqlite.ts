import sqlite3 from "sqlite3"
import {open} from "sqlite"
import path from "node:path"
import {fileURLToPath} from "url"

sqlite3.verbose()

// TODO auto isolate strings in condition?

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const db = await open({
    filename: path.join(__dirname, "database.db"),
    driver: sqlite3.cached.Database
})

/**
 * Create the database tables necessary for this bot to run, if not already created.
 */
export async function createTables() {
    await db.exec("CREATE TABLE IF NOT EXISTS UserList(UserID INTEGER PRIMARY KEY, SchedgeUpID varchar(7), DiscordUserSnowflake varchar(64), DisplayName varchar(150))")
    await db.exec("CREATE TABLE IF NOT EXISTS Settings(SettingKey varchar(60), SettingValue varchar(255))")
    await db.exec("CREATE TABLE IF NOT EXISTS ShowDays(ShowDayID INTEGER PRIMARY KEY, ShowDayDate DATETEXT, SchedgeUpIDs varchar(7), DiscordChannelSnowflake varchar(64), CreatedAtEpoch TIMESTAMP, DayTimeShows BOOLEAN)")
    await db.exec("CREATE TABLE IF NOT EXISTS DayTimeShows(ShowTemplateIDOrName varchar(60))")
    await db.exec("CREATE TABLE IF NOT EXISTS FoodOrderVeterans(UserID INTEGER)")
    await db.exec("CREATE TABLE IF NOT EXISTS ChangeOrderButtonCallbackIDs(ID varchar(36), FoodChoice varchar(1), DiscordChannelSnowflake varchar(64))")
    await db.exec("CREATE TABLE IF NOT EXISTS UserFoodAllergies(UserID INTEGER, Allergy varchar(140))")
    console.log("Database tables up and running")
}

type DatabaseTables =
    "UserList"
    | "Settings"
    | "ShowDays"
    | "DayTimeShows"
    | "FoodOrderVeterans"
    | "ChangeOrderButtonCallbackIDs"
    | "UserFoodAllergies"

type Params = (string | number)[]

/**
 * Method caller is responsible for the amount and order of params, such that it matches the column layout of the table specified
 * @param table The table to insert an entry into
 * @param params The values of the entry, in the order specified in the Database Layout
 */
export async function addEntry(table: DatabaseTables, ...params: Params) {
    const query = "INSERT INTO " + table + " VALUES(" + transformParams(params) + ")"
    debugLogQuery(query)
    await db.exec(query)
}

function transformParams(params: Params) {
    const transformed: Params = []

    params.forEach(param => {
        if (typeof param === "string" && param !== "null") { // TODO check null
            transformed.push("\"" + param + "\"")
        } else {
            transformed.push(param)
        }
    })

    return transformed
}

/**
 * Select some entries from a table. Returns an empty array if no entries match condition
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

/**
 * Select ALL entries from a table. Returns an empty array if the table is empty
 * @param table where to select entries from
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectAllEntires(table: DatabaseTables, columns?: string[]) {
    const columnString = columns === undefined ? "*" : "(" + columns + ")"
    const query = "SELECT " + columnString + " FROM " + table
    debugLogQuery(query)
    return await db.all(query)
}

export async function deleteEntries(table: DatabaseTables, condition: string) {
    const query = "DELETE FROM " + table + " WHERE " + condition
    debugLogQuery(query)
    return await db.exec(query)
}

export async function updateEntry(table: DatabaseTables, condition: string, column: string, newValue: string) {
    const query = "UPDATE " + table + " SET " + column + "=\"" + newValue + "\"" + "WHERE " + condition
    debugLogQuery(query)
    return await db.exec(query)
}

/**
 * TODO
 * @param result
 * @param parameterName
 */
export function needDatabase<T>(result: T | undefined, parameterName: string) { // TODO generalize?
    if (result == null) throw new Error("Needed database result but got undefined: " + parameterName)
    return result
}

function debugLogQuery(query: string) {
    console.debug("[Debug] Sent SQL Query: " + query) // TODO move to logger
}
