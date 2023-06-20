import {Guild, GuildMember} from "discord.js";
import {Worker} from "../scraper/pages/eventAssignement.js"
import {selectEntry} from "./sqlite.js";

export class User {
    public discord: DiscordUser
    public schedgeUp: SchedgeUpUser


    constructor(discord: DiscordUser, schedgeUp: SchedgeUpUser) {
        this.discord = discord;
        this.schedgeUp = schedgeUp;
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
        this.member = member;
    }
}

export class SchedgeUpUser {
    userId: string
    displayName: string
    roles: string[]
    groups: string[]

    constructor(userId: string, displayName: string, roles: string[], groups: string[]) {
        this.userId = userId;
        this.displayName = displayName;
        this.roles = roles;
        this.groups = groups;
    }
}


export async function updateSchedgeUpUser() {
    //TODO: Change SchedgeUpUser??
}

/**
 * Returns {@code null} if given worker is a Guest
 */
export async function getUserFromSchedgeUp(worker: Worker, guild: Guild) {
    if(worker.id == null) return null


    const result = await selectEntry("Users", "SchedgeUpID=\"" + worker.id + "\"", ["DiscordUserSnowflake", "DisplayName"])

    if(result == undefined) {
        //User is not cached
    }

    return new User(new DiscordUser(await guild.members.fetch(result["DiscordUserSnowflake"])), new SchedgeUpUser(worker.id, result["DisplayName"], [], [])) //TODO: Roles and groups
}

export async function getUserFromDiscord(member: GuildMember) {
    const result = await selectEntry("Users", "DiscordUserSnowflake=\"" + member.id + "\"", ["DisplayName", "SchedgeUpId"])
    return new User(new DiscordUser(member), new SchedgeUpUser(result["SchedgeUpId"], result["DisplayName"], [], []))
     //TODO: Log if database does not have user
}

function isDateOld(date: Date) {
    return Date.now() - date.getTime() > 1000 * 60 * 60 * 24 * 3 // 3 days, TODO: make this configurable
}

/**
 * Register a new user based on their SchedgeUp info, queries administrator to give the discord user to link the new user to
 * @param worker
 */
async function registerNewUser() {
    //Database should always have updated list of user list, such that administrator could always link someone in the list to a discord user
    //When new user is registered, somehow check that that user might need to be added to already created channels
}