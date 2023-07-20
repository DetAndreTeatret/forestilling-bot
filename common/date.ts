import assert from "assert"

export class DateRange {
    public dateFrom
    public dateTo

    constructor(dateFrom: Date, dateTo: Date) {
        this.dateFrom = dateFrom
        this.dateTo = dateTo

        assert(dateFrom <= dateTo)
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
        return formatDateYYYYMM(this.dateFrom) + " to " + formatDateYYYYMM(this.dateTo)
    }
}

export function formatDateYYYYMM(date: Date) {
    return "" + date.getFullYear() + "-" + (date.getMonth() + 1)
}

export function tomorrow(date?: Date) {
    return afterDays(1, date)
}

export function afterDays(days: number, from?: Date) {
    const fromDate = from == undefined ? new Date() : from
    return incrementDate(fromDate.getFullYear(), fromDate.getMonth() + 1, fromDate.getDay(), days)
}

/**
 * All values NON-ZERO INDEXED(Looking at you JavaScript month)
 */
function incrementDate(year: number, month: number, days: number, daysToIncrement: number) {
    for (let i = 0; i < daysToIncrement; i++) {
        if(getMaxDays(month, year) == days) {
            days = 1
            if(month == 12) {
                //Happy new year!
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
 * DOES NOT ACCOUNT FOR LEAP YEARS, EXPECTS MONTHS NON-ZERO INDEXED
 */
function getMaxDays(month: number, year: number) {
    if(month >= 13 || month <= 0) throw new Error("Month with number " + month + " does not exist")
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
            if(year % 4 == 0) {
                if(year % 100 == 0) {
                    if(year % 400 == 0) {
                        return 29
                    } else return 28
                } else return 29
            } else return 28
        }
        default : throw new Error("Invalid state (#getMaxDays)")
    }
}