/**
 * Renders the date in the YYYY-MM format(e.g. 2005-11-12), disregards all data more precise than months.
 * Includes a "0" before months numbers <10 to stay consistent with {@link renderDateYYYYMMDD}.
 * @param date the date to render
 */
export function renderDateYYYYMM(date: Date) {
    return "" + date.getFullYear() + "-" + ((date.getMonth() + 1) < 10 ? "0" : "") + (date.getMonth() + 1)
}

/**
 * Renders the date in the YYYY-MM-DD format(e.g. 2003-02-08), disregards all data more precise than days.
 * This function including the "0" before month and date numbers <10 is important for database storage! If not it can ruin string comparisons.
 * @param date the date to render
 */
export function renderDateYYYYMMDD(date: Date) {
    return "" + date.getFullYear() + "-" + ((date.getMonth() + 1) < 10 ? "0" : "")  + (date.getMonth() + 1) + "-" + (date.getDate() < 10 ? "0" : "") + date.getDate()
}

export function renderDatehhmmss(date: Date) {
    return date.toLocaleString("nb-NO", {hour: "2-digit", minute: "2-digit", second: "2-digit"})
}

export function renderDatehhmm(date: Date) {
    return date.toLocaleString("nb-NO", {hour: "2-digit", minute: "2-digit"})

}

export function tomorrow(date?: Date) {
    return afterDays(1, date)
}

export function afterDays(days: number, from?: Date) {
    const fromDate = from === undefined ? new Date() : from
    return incrementDate(fromDate.getFullYear(), fromDate.getMonth() + 1, fromDate.getDate(), days)
}

/**
 * All values NON-ZERO INDEXED(Looking at you JavaScript month)
 */
function incrementDate(year: number, month: number, days: number, daysToIncrement: number) {
    for (let i = 0; i < daysToIncrement; i++) {
        if (getMaxDays(month, year) === days) {
            days = 1
            if (month === 12) {
                // Happy new year!
                month = 1
                year++
            } else {
                month++
            }
        } else {
            days++
        }
    }

    return new Date(year, month - 1, days)
}

/**
 * EXPECTS MONTHS NON-ZERO INDEXED
 */
function getMaxDays(month: number, year: number) {
    if (month >= 13 || month <= 0) throw new Error("Month with number " + month + " does not exist")
    switch (month){
        case 1:
        case 3:
        case 5:
        case 7:
        case 8:
        case 10:
        case 12: return 31
        case 4:
        case 6:
        case 9:
        case 11: return 30
        case 2: {
            if (year % 4 === 0) {
                if (year % 100 === 0) {
                    if (year % 400 === 0) {
                        return 29
                    } else return 28
                } else return 29
            } else return 28
        }
        default : throw new Error("Invalid state (#getMaxDays)")
    }
}


export function getDayNameNO(date: Date) {
    switch (date.getDay()) {
        case 0: return "Søndag"
        case 1: return "Mandag"
        case 2: return "Tirsdag"
        case 3: return "Onsdag"
        case 4: return "Torsdag"
        case 5: return "Fredag"
        case 6: return "Lørdag"
        default: throw new Error("Invalid day number " + date.getDay())
    }
}

export function isToday(date: Date) {
    const now = new Date()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

/**
 * Creates a pretty string for under 24H durations in the same day.
 * TODO account for durations past midnight..
 * e.g. 1900-2100 (1 time og 15 minutter)
 * @param dateFrom
 * @param dateTo
 */
export function formatLength(dateFrom: Date, dateTo: Date) {
    let lengthMinutes = (dateTo.getTime() - dateFrom.getTime()) / 1000 / 60
    let lengthString = ""

    if (lengthMinutes >= 60) {
        let hours = 0
        while (lengthMinutes >= 60) {
            hours++
            lengthMinutes-= 60
        }
        lengthString = hours + " time" + (hours > 1 ? "r" : "")
    }

    if (lengthMinutes > 0) {
        lengthString += " og " + lengthMinutes + " minutt" + (lengthMinutes > 1 ? "er" : "")
    }

    return renderDatehhmm(dateFrom) + "-" + renderDatehhmm(dateTo) + "(" + lengthString + ")"
}
