import {Guild, GuildMember, Snowflake} from "discord.js"
import {Worker} from "../scraper/pages/eventAssignement.js"
import {selectEntry} from "./sqlite.js"
import {sendManagerMessage} from "../discord/discord.js"

export class User {
    public discord: DiscordUser
    public schedgeUp: SchedgeUpUser


    constructor(discord: DiscordUser, schedgeUp: SchedgeUpUser) {
        this.discord = discord
        this.schedgeUp = schedgeUp
    }

    public equals(user: DiscordUser | SchedgeUpUser | User) {
        if(user === undefined || user === null) return false

        if(user instanceof DiscordUser) {
            return this.discord === user
        } else if (user instanceof SchedgeUpUser) {
            return this.schedgeUp === user
        } else {
            return this === user
        }

        return false
    }

}

export class DiscordUser {
    member: GuildMember

    constructor(member: GuildMember) {
        this.member = member
    }
}

export class SchedgeUpUser {
    userId: string
    displayName: string
    roles: string[]
    groups: string[]

    constructor(userId: string, displayName: string, roles: string[], groups: string[]) {
        this.userId = userId
        this.displayName = displayName
        this.roles = roles
        this.groups = groups
    }
}


/**
 * Returns {@code null} if given worker is a Guest
 */
export async function getLinkedDiscordUser(worker: Worker, guild: Guild): Promise<Snowflake | null> {
    if(worker.id == null) return null


    const result = await selectEntry("UserList", "SchedgeUpID=\"" + worker.id + "\"", ["DiscordUserSnowflake"])

    if(result == undefined) {
        await sendManagerMessage({content: "SchedgeUp user " + worker.who + "(" + worker.id + ") does not have a linked discord account"}, guild)
        return null
    }

    return result["DiscordUserSnowflake"] as string
}

export async function getLinkedSchedgeUpUser(member: GuildMember) {
    const result = await selectEntry("UserList", "DiscordUserSnowflake=\"" + member.id + "\"", ["SchedgeUpId"])
    return result["SchedgeUpId"]
     //TODO: Log if database does not have user
}