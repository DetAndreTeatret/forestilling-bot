import {GuildMember, Snowflake} from "discord.js"
import {Worker} from "schedgeup-scraper"
import {addEntry, deleteEntries, selectAllEntires, selectEntry} from "./sqlite.js"
import {Logger} from "../common/logging.js"

/**
 * A class representing a single user as it's stored in the database
 */
export class User {
    private readonly _userId: number
    private readonly _schedgeUpId: string
    private readonly _discordSnowflake: Snowflake

    constructor(userId: number, schedgeUpId: string, discordSnowflake: Snowflake) {
        this._userId = userId
        this._schedgeUpId = schedgeUpId
        this._discordSnowflake = discordSnowflake
    }


    /**
     * The user id of the user, only used as a way to identify users in the database
     */
    get userId(): number {
        return this._userId
    }

    /**
     * The SchedgeUp id of the account linked to this user
     */
    get schedgeUpId(): string {
        return this._schedgeUpId
    }

    /**
     * The Discord snowflake of the account linked to this user
     */
    get discordSnowflake(): Snowflake {
        return this._discordSnowflake
    }
}

/**
 * Create a new user. No users can share SchedgeUp ids or Discord snowflakes
 * @param schedgeUpId The SchedgeUp id of the account that should be linked to this user.
 * @param discordUserSnowflake The Discord snowflake of the account that should be linked to this user.
 */
export async function addNewUser(schedgeUpId: string, discordUserSnowflake: Snowflake) {
    // First column should be null so the userid is autoincremented
    await addEntry("UserList", "null", schedgeUpId, discordUserSnowflake)
}

/**
 * Fetch all stored users, returns empty array if no users
 */
export async function fetchAllUsers(columns?: string[]) {
    return (await selectAllEntires("UserList", columns)).map(result => new User(result["UserID"], result["SchedgeUpID"], result["DiscordUserSnowflake"]))
}

/**
 * Fetch a user from the database given either their SchedgeUp id or Discord snowflake
 */
export async function fetchUser(schedgeUpId?: string, discordUserSnowflake?: Snowflake) {
    if(schedgeUpId === undefined && discordUserSnowflake === undefined) {
        return undefined
    }

    const result = await selectEntry("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordUserSnowflake + "\"")
    if(result === undefined) return undefined
    return new User(result["UserID"], result["SchedgeUpID"], result["DiscordUserSnowflake"])
}

/**
 * Delete a user given either their SchedgeUp id or Discord snowflake
 */
export async function deleteUser(schedgeUpId?: string, discordUserSnowflake?: Snowflake) {
    if(schedgeUpId === undefined && discordUserSnowflake === undefined) {
        return undefined
    }

    await deleteEntries("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordUserSnowflake + "\"")
}

/**
 * Returns {@code null} if given worker is a Guest, returns undefined and logs to logger if user does not
 * have a linked account
 */
export async function getLinkedDiscordUser(worker: Worker, logger: Logger): Promise<Snowflake | null | undefined> {
    if(worker.id === null) return null

    const result = await selectEntry("UserList", "SchedgeUpID=\"" + worker.id + "\"", ["DiscordUserSnowflake"])

    if(result === undefined) {
        await logger.logPart("SchedgeUp user " + worker.who + "(" + worker.id + ") does not have a linked Discord account")
        return undefined
    }

    return result["DiscordUserSnowflake"]
}

/**
 * Get the SchedgeUp id linked to the user that is linked to the given Discord user. Returns undefined and logs to logger if user
 * does not have a linked account
 */
export async function getLinkedSchedgeUpUser(member: GuildMember, logger: Logger): Promise<string | undefined> {
    const result = await selectEntry("UserList", "DiscordUserSnowflake=\"" + member.id + "\"", ["SchedgeUpId"])

    if(result === undefined) {
        await logger.logPart("Discord user " + member.displayName + " does not have a linked SchedgeUp account")
        return undefined
    }

    return result["SchedgeUpId"]
}
