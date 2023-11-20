import {renderDateYYYYMMDD} from "../common/date.js"
import {addEntry, deleteEntries, selectAllEntires, selectEntry, updateEntry} from "./sqlite.js"
import {Snowflake} from "discord.js"

/**
 * A class representing a single day that has one or more shows.
 */
export class ShowDay {
    private readonly _when: Date
    private readonly _schedgeUpIds: string[]
    private readonly _discordChannelSnowflake: string
    private readonly _createdAt: Date
    private readonly _dayTimeShows: boolean

    constructor(when: Date, schedgeUpIds: string[], discordChannelSnowflake: string, createdAt: Date, dayTimeShows: boolean) {
        this._when = when
        this._schedgeUpIds = schedgeUpIds
        this._discordChannelSnowflake = discordChannelSnowflake
        this._createdAt = createdAt
        this._dayTimeShows = dayTimeShows
    }

    /**
     * Returns the date of this day, only precise to YYYY-MM-DD
     */
    get when(): Date {
        return this._when
    }

    /**
     * SchedgeUp ids of the shows belonging to this day
     */
    get schedgeUpIds(): string[] {
        return this._schedgeUpIds
    }

    /**
     * The Discord channel snowflake belonging to the channel used for this day
     */
    get discordChannelSnowflake(): string {
        return this._discordChannelSnowflake
    }

    /**
     * The instant this ShowDay object was first created in the database
     */
    get createdAt(): Date {
        return this._createdAt
    }

    get dayTimeShows(): boolean {
        return this._dayTimeShows
    }
}

/**
 * Creates a new show day.
 * @param discordChannelSnowflake the Discord channel snowflake belonging to the channel used for this day
 * @param showDay the date of this day, only precise to YYYY-MM-DD.
 * @param dayTime
 * @param schedgeUpIds the SchedgeUp ids of events belonging to this day
 */
export async function createNewShowday(discordChannelSnowflake: string, showDay: Date, dayTime: boolean, ...schedgeUpIds: string[]) {
    // null to autoincrement
    await addEntry("ShowDays", "null", renderDateYYYYMMDD(showDay), schedgeUpIds.join(","), discordChannelSnowflake, Date.now(), Number(dayTime))
}

/**
 * Add a SchedgeUp event to an existing show day.
 * @param showDay the show day to add a new event to
 * @param eventId the event to add
 */
export async function addEventToShowDay(showDay: ShowDay, eventId: string) {
    const result = await fetchShowDayBySU(showDay.schedgeUpIds[0], showDay.dayTimeShows)
    if(!result) {
        throw new Error("ShowDay not found when trying to update ShowDay")
    } else {
        const currentIds = result.schedgeUpIds
        currentIds.push(eventId)
        await updateEntry("ShowDays", "DiscordChannelSnowflake=\"" + showDay.discordChannelSnowflake + "\"", "SchedgeUpIDs", currentIds.join(","))
    }
}

/**
 * Fetch the show day belonging to a SchedgeUp event given the SchedgeUp event id
 * @param schedgeUpShowId the SchedgeUp to use for searching
 * @param dayTime If the ShowDay should be for daytime shows or not
 */
export async function fetchShowDayBySU(schedgeUpShowId: string, dayTime: boolean) {
    const result = await selectEntry("ShowDays", "SchedgeUpIDs LIKE \"%" + schedgeUpShowId + "%\" AND DayTimeShows=" + Number(dayTime))
    if(result === undefined) return undefined
    return new ShowDay(new Date(result["ShowDayDate"]), String(result["SchedgeUpIDs"]).split(","), result["DiscordChannelSnowflake"], result["CreatedAtEpoch"], result["DayTimeShows"])
}

/**
 * Fetch a show day based on the date it's happening.
 * @param date the date of the show day. Only takes into account YYYY-MM-DD.
 * @param dayTime If the ShowDay should be for daytime shows or not
 */
export async function fetchShowDayByDate(date: Date, dayTime: boolean) {
    const result = await selectEntry("ShowDays", "ShowDayDate=\"" + renderDateYYYYMMDD(date) + "\" AND DayTimeShows=" + Number(dayTime))
    if(result === undefined) return undefined
    return new ShowDay(new Date(result["ShowDayDate"]), String(result["SchedgeUpIDs"]).split(","), result["DiscordChannelSnowflake"], result["CreatedAtEpoch"], result["DayTimeShows"])
}

/**
 * Fetch a show day based on the discord channel belonging to the show day.
 * @param channelSnowflake the channel to find the show day of
 */
export async function fetchShowDayByDiscordChannel(channelSnowflake: Snowflake) {
    const result = await selectEntry("ShowDays", "DiscroChannelSnowflake=\"" + channelSnowflake + "\"")
    if(result === undefined) return undefined
    return new ShowDay(new Date(result["ShowDayDate"]), String(result["SchedgeUpIDs"]).split(","), result["DiscordChannelSnowflake"], result["CreatedAtEpoch"], result["DayTimeShows"])
}

export async function addDayTimeShow(templateIdOrShowName: string) {
    await addEntry("DayTimeShows", templateIdOrShowName.toLowerCase())
}

export async function removeDayTimeShow(templateIdOrShowName: string) {
    await deleteEntries("DayTimeShows", "ShowTemplateIDOrName=\"" + templateIdOrShowName.toLowerCase() + "\"")
}

export async function isDayTimeShow(templateId: string, showName: string) {
    const result = await selectEntry("DayTimeShows", "ShowTemplateIDOrName=\"" + templateId.toLowerCase() + "\" OR ShowTemplateIDOrName=\"" + showName.toLowerCase() + "\"")
    return result !== undefined
}

export async function fetchAllDayTimeShows(): Promise<string[]> {
    const result = await selectAllEntires("DayTimeShows")
    return result.map(e => e["ShowTemplateIDOrName"])
}
