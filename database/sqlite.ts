import sqlite3 from "sqlite3";
import { open } from 'sqlite'
import path from "node:path"

sqlite3.verbose() //TODO: enable on startup argument

const db = await open({
    filename: path.join(__dirname, "database.db"),
    driver: sqlite3.cached.Database
})

export async function queryDatabase() {

}

