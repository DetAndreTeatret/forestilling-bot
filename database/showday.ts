import {formatDateYYYYMMDD} from "../common/date.js"
import {addEntry, selectEntry, updateEntry} from "./sqlite.js"

export class ShowDay {
    private readonly _when: Date
    private readonly _schedgeUpIds: string[]
    private readonly _discordChannelSnowflake: string
    private readonly _createdAt: Date

    constructor(when: Date, schedgeUpIds: string[], discordChannelSnowflake: string, createdAt: Date) {
        this._when = when
        this._schedgeUpIds = schedgeUpIds
        this._discordChannelSnowflake = discordChannelSnowflake
        this._createdAt = createdAt
    }


    get when(): Date {
        return this._when
    }

    get schedgeUpIds(): string[] {
        return this._schedgeUpIds
    }

    get discordChannelSnowflake(): string {
        return this._discordChannelSnowflake
    }

    get createdAt(): Date {
        return this._createdAt
    }
}

export async function createNewShowday(discordChannelSnowflake: string, showDay: Date, ...schedgeUpIds: string[]) {
    await addEntry("ShowDays", formatDateYYYYMMDD(showDay), JSON.stringify(schedgeUpIds), discordChannelSnowflake, Date.now())
}

export async function addEventToShowDay(showDay: ShowDay, eventId: string) {
    const result = await fetchShowDayBySU(showDay.schedgeUpIds[0])
    if(!result) {
        throw new Error("ShowDay not found when trying to update ShowDay")
    } else {
        const currentIds = result.schedgeUpIds
        currentIds.push(eventId)
        await updateEntry("ShowDays", "DiscordChannelSnowflake=\"" + showDay.discordChannelSnowflake + "\"", "SchedgeUpIDs", JSON.stringify(currentIds))
    }
}

export async function fetchShowDayBySU(schedgeUpShowId: string) {
    const result = await selectEntry("ShowDays", "SchedgeUpIDs LIKE \"%" + schedgeUpShowId + "\"%") // TODO does the string thing work
    if(result === undefined) return undefined
    return new ShowDay(new Date(result["ShowDayDate"]), JSON.parse(result["SchedgeUpIDs"]), result["DiscordChannelSnowflake"], result["CreatedAtEpoch"])
}

/**
 * Only takes into account YYYY-MM-DD
 */
export async function fetchShowDayByDate(date: Date) {
    const result = await selectEntry("ShowDays", "ShowDayDate=\"" + formatDateYYYYMMDD(date) + "\"")
    if(result === undefined) return undefined
    return new ShowDay(new Date(result["ShowDayDate"]), JSON.parse(result["SchedgeUpIDs"]), result["DiscordChannelSnowflake"], result["CreatedAtEpoch"])
}
