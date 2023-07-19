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

export function tomorrow(date?: Date) { //TODO: check new years/new month logic
    const oldDate = date == undefined ? new Date() : date
    const newDate = new Date()
    if(getMaxDays(oldDate.getMonth() + 1) == oldDate.getDate()) {
        newDate.setDate(1)
        if(oldDate.getMonth() == 12) {
            //Happy new year!!
            newDate.setMonth(1)
            newDate.setFullYear(oldDate.getFullYear() + 1)
        } else {
            newDate.setMonth(oldDate.getMonth() + 1)
        }
    } else {
        newDate.setDate(oldDate.getDate() + 1)
    }

    return newDate
}

export function oneMinute(date?: Date) {
    const oldDate = date == undefined ? new Date() : date
    const newDate = new Date()
    newDate.setMinutes(oldDate.getMinutes() + 1)

    return newDate
}

/**
 * DOES NOT ACCOUNT FOR LEAP YEARS
 */
function getMaxDays(month: number) {
    if(month >= 13 || month <= 0) throw new Error("Month with number " + month + " does not exist")
    switch (month){
        case 1:
        case 3:
        case 5:
        case 7:
        case 8:
        case 10:
        case 12: return 31
        case 2: return 28
        case 4:
        case 6:
        case 9:
        case 11: return 30
        default : throw new Error("Invalid state (#getMaxDays)")
    }
}