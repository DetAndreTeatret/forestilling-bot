import {GuildChannel, Snowflake} from "discord.js"
import {selectEntries} from "./sqlite.js"
import {renderDateYYYYMMDD} from "../common/date.js"

/**
 * Get snowflakes of {@link GuildChannel}s that can be deleted. (System time newer than time stored in database)
 */
export async function getDeleteableChannels(): Promise<Snowflake[]> {
    const columnName = "DiscordChannelSnowflake"
    const result = await selectEntries("ShowDays", "\"" + renderDateYYYYMMDD(new Date()) + "\"" + " > ShowDayDate", [columnName])
    return result.map(value => value[columnName])
}
