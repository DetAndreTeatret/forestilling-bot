import {GuildMember} from "discord.js";
import {Worker} from "../scraper/pages/eventAssignement.js"
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
    id: string
    displayName: string
    roles: string[]
    groups: string[]

    constructor(id: string, displayName: string, roles: string[], groups: string[]) {
        this.id = id;
        this.displayName = displayName;
        this.roles = roles;
        this.groups = groups;
    }
}

export async function linkSchedgeUpUser() {
    //TODO: Link some user(based on discord) to their SchedgeUp Display name?(user id?)
}

export async function updateSchedgeUpUser() {
    //TODO: Change SchedgeUpUser??
}

export async function getUserFromSchedgeUp(worker: Worker) {

    return new User()
}

export async function getUserFromDiscord(member: GuildMember) {

    return new User()
}