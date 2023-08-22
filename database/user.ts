import {Guild, GuildMember, Snowflake} from "discord.js"
import {Worker} from "../scraper/pages/eventAssignement.js"
import {addEntry, deleteEntries, selectEntries, selectEntry} from "./sqlite.js"
import {sendManagerMessage} from "../discord/discord.js"

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

export async function addNewUser(schedgeUpId: string, discordUserSnowflake: string) {
    // First column should be null so the userid is autoincremented
    await addEntry("UserList", null, schedgeUpId, discordUserSnowflake)
}

export async function fetchUser(schedgeUpId?: string, discordSnowflake?: Snowflake) { // TODO: Use Snowflake instead of string where applicable
    const result = await selectEntry("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordSnowflake + "\"")
    if(result === undefined) return undefined
    return new User(result["UserId"], result["SchedgeUpID"], result["DiscordUserSnowflake"])
}

export async function deleteUser(schedgeUpId?: string, discordSnowflake?: Snowflake) {
    await deleteEntries("UserList", "SchedgeUpID=\"" + schedgeUpId + "\" OR DiscordUserSnowflake=\"" + discordSnowflake + "\"")
}

/**
 * Returns {@code null} if given worker is a Guest/Not linked user
 */
export async function getLinkedDiscordUser(worker: Worker, guild: Guild): Promise<Snowflake | null> {
    if(worker.id == null) return null

    const result = await selectEntry("UserList", "SchedgeUpID=\"" + worker.id + "\"", ["DiscordUserSnowflake"])

    if(result === undefined) {
        await sendManagerMessage({content: "SchedgeUp user " + worker.who + "(" + worker.id + ") does not have a linked discord account"}, guild)
        return null
    }

    return result["DiscordUserSnowflake"]
}

export async function getLinkedSchedgeUpUser(member: GuildMember) {
    const result = await selectEntry("UserList", "DiscordUserSnowflake=\"" + member.id + "\"", ["SchedgeUpId"])
    if(result === undefined) return undefined
    return result["SchedgeUpId"]
     // TODO: Log if database does not have user
}
