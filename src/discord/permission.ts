import {GuildMember} from "discord.js"
import {needSetting} from "../database/settings.js"
import {needNotNullOrUndefined} from "../util/util.js"
import {EnvironmentVariable, needEnvVariable} from "../util/config.js"

export enum PermissionLevel {
    ADMINISTRATOR,
    HUSANSVARLIG
}

export async function checkPermission(member: GuildMember, permission: PermissionLevel): Promise<boolean> {
    switch (permission) {
        case PermissionLevel.ADMINISTRATOR: {
            if (member.user.bot || member.permissions.has("Administrator")) return true
            const adminRole = needNotNullOrUndefined(await member.guild.roles.fetch(await needSetting("admin_role_snowflake")), "adminRole")
            return (member.roles.cache.some((_role, snowflake) => snowflake === adminRole.id))
        }
        case PermissionLevel.HUSANSVARLIG: {
            const husansvarligRole = needNotNullOrUndefined(await member.guild.roles.fetch(needEnvVariable(EnvironmentVariable.HUSANSVARLIG_ROLE_SNOWFLAKE)), "husansvarligRole")
            if (member.roles.cache.has(husansvarligRole.id)) return true
            return checkPermission(member, PermissionLevel.ADMINISTRATOR)
        }
        default: {
            console.error("Checked permission for non-existing level: " + permission)
            return false
        }
    }
}
