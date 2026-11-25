export class DateRange {
    public dateFrom
    public dateTo

    /**
     * Discards anything lower than dates(hours etc..)
     * */
    constructor(dateFrom: Date, dateTo: Date) {
        this.dateFrom = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate())
        this.dateTo = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate())

        if (this.dateTo < this.dateFrom) {
            throw new Error("Invalid date range: " + dateFrom.toDateString() + " to " + dateTo.toDateString())
        }
    }

    contains(date: Date) {
        return this.dateFrom <= date && date <= this.dateTo
    }

    isSingleMonth() {
        return this.dateFrom.getMonth() === this.dateTo.getMonth() && this.dateFrom.getFullYear() === this.dateTo.getFullYear()
    }

    isSingleDay() {
        return this.isSingleMonth() && this.dateFrom.getDay() === this.dateTo.getDay()
    }

    toString() {
        return renderDateYYYYMM(this.dateFrom) + " to " + renderDateYYYYMM(this.dateTo)
    }
}

/**
 * Renders the date in the YYYY-MM format(e.g. 2005-11-12), disregards all data more precise than months.
 * Includes a "0" before months numbers <10 to stay consistent with {@link renderDateYYYYMMDD}.
 * @param date the date to render
 * @internal
 */
export function renderDateYYYYMM(date: Date) {
    return "" + date.getFullYear() + "-" + ((date.getMonth() + 1) < 10 ? "0" : "") + (date.getMonth() + 1)
}

/**
 * Renders the date in the YYYY-MM-DD format(e.g. 2003-02-08), disregards all data more precise than days.
 * This function including the "0" before month and date numbers <10 is important for database storage! If not it can ruin string comparisons.
 * @param date the date to render
 * @internal
 */
export function renderDateYYYYMMDD(date: Date) {
    return "" + date.getFullYear() + "-" + ((date.getMonth() + 1) < 10 ? "0" : "")  + (date.getMonth() + 1) + "-" + (date.getDate() < 10 ? "0" : "") + date.getDate()
}

/**
 * @internal
 */
export function tomorrow(date?: Date) {
    return afterDays(1, date)
}

/**
 * @internal
 */
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
