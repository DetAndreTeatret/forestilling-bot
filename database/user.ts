import {GuildMember, Snowflake} from "discord.js"
import {Worker} from "../scraper/pages/eventAssignement.js"
import {addEntry, deleteEntries, selectEntry} from "./sqlite.js"
import {Logger} from "../common/logging.js"

export class User {
    private readonly _userId: number
    private readonly _schedgeUpId: string
    private readonly _discordSnowflake: Snowflake

    constructor(userId: number, schedgeUpId: string, discordSnowflake: Snowflake) {
        this._userId = userId
        this._schedgeUpId = schedgeUpId
        this._discordSnowflake = discordSnowflake
    }


    get userId(): number {
        return this._userId
    }

    get schedgeUpId(): string {
        return this._schedgeUpId
    }

    get discordSnowflake(): Snowflake {
        return this._discordSnowflake
    }
}

export async function addNewUser(schedgeUpId: string, discordUserSnowflake: Snowflake) {
    // First column should be null so the userid is autoincremented
    await addEntry("UserList", "null", schedgeUpId, discordUserSnowflake)
}

export async function fetchUser(schedgeUpId?: string, discordUserSnowflake?: Snowflake) {
    const result = await selectEntry("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordUserSnowflake + "\"")
    if(result === undefined) return undefined
    return new User(result["UserId"], result["SchedgeUpID"], result["DiscordUserSnowflake"])
}

export async function deleteUser(schedgeUpId?: string, discordSnowflake?: Snowflake) {
    await deleteEntries("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordSnowflake + "\"")
}

/**
 * Returns {@code null} if given worker is a Guest/Not linked user, returns undefined and logs to logger if user does not
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

export async function getLinkedSchedgeUpUser(member: GuildMember, logger: Logger): Promise<string | undefined> {
    const result = await selectEntry("UserList", "DiscordUserSnowflake=\"" + member.id + "\"", ["SchedgeUpId"])

    if(result === undefined) {
        await logger.logPart("Discord user " + member.displayName + " does not have a linked SchedgeUp account")
        return undefined
    }

    return result["SchedgeUpId"]
}
