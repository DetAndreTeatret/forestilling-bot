import {Snowflake} from "discord.js"
import {Worker} from "schedgeup-scraper"
import {addEntry, deleteEntries, selectAllEntires, selectEntries, selectEntry} from "./sqlite.js"
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
    if (schedgeUpId === undefined && discordUserSnowflake === undefined) {
        return undefined
    }

    const result = await selectEntry("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordUserSnowflake + "\"")
    if (result === undefined) return undefined
    return new User(result["UserID"], result["SchedgeUpID"], result["DiscordUserSnowflake"])
}

/**
 * Delete a user given either their SchedgeUp id or Discord snowflake
 */
export async function deleteUser(schedgeUpId?: string, discordUserSnowflake?: Snowflake) {
    if (schedgeUpId === undefined && discordUserSnowflake === undefined) {
        return undefined
    }

    await deleteEntries("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordUserSnowflake + "\"")
}

/**
 * Returns {@code null} if given worker is a Guest, returns undefined and logs to logger if user does not
 * have a linked account
 */
export async function getLinkedDiscordUser(worker: Worker, logger: Logger): Promise<Snowflake | null | undefined> {
    if (worker.id === null) return null

    const result = await selectEntry("UserList", "SchedgeUpID=\"" + worker.id + "\"", ["DiscordUserSnowflake"])

    if (result === undefined) {
        await logger.logPart("SchedgeUp user " + worker.who + "(" + worker.id + ") does not have a linked Discord account")
        return undefined
    }

    return result["DiscordUserSnowflake"]
}

/**
 * Get the SchedgeUp id linked to the user that is linked to the given Discord user. Returns undefined and logs to logger if user
 * does not have a linked account
 */
export async function getLinkedSchedgeUpUser(member: Snowflake, logger: Logger): Promise<string | undefined> {
    const result = await selectEntry("UserList", "DiscordUserSnowflake=\"" + member + "\"", ["SchedgeUpID"])

    if (result === undefined) {
        await logger.logPart("Discord user " + member + " does not have a linked SchedgeUp account")
        return undefined
    }

    return result["SchedgeUpId"]
}

/**
 * Add a Discord user as a guest user to some showday.
 * @param guestMember the user to be added to the guest table
 * @param showChannel the channel they should be guest in
 * @returns nothing if everything went ok, null if there is no showday with the given showChannel
 */
export async function addShowGuest(guestMember: Snowflake, showChannel: Snowflake) {
    const result = await selectEntry("ShowDays", "DiscordChannelSnowflake=\"" + showChannel + "\"", ["DiscordChannelSnowflake"])

    if (result === undefined) return null

    await addEntry("ShowDayGuests", showChannel, guestMember)
}

/**
 * Get all guest users currently assigned to the given showDay channel.
 * @returns empty but not undefined if no matches
 */
export async function getShowGuestsForChannel(showChannel: Snowflake): Promise<Snowflake[]> {
    const result =  await selectEntries("ShowDayGuests", "DiscordChannelSnowflake=\"" + showChannel + "\"")

    return result.map(e => e["DiscordUserSnowflake"])
}

export async function deleteShowGuest(guestMember: Snowflake, showChannel: Snowflake) {
    await deleteEntries("ShowDayGuests", "DiscordChannelSnowflake=\"" + showChannel + "\" AND DiscordUserSnowflake=\"" + guestMember + "\"")
}

/**
 * Delete all guest entries for a given channel, should be called when deleting a channel.
 */
export async function deleteShowGuestsForChannel(showChannel: Snowflake) {
    await deleteEntries("ShowDayGuests", "DiscordChannelSnowflake=\"" + showChannel + "\"")
}
