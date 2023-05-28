import assert from "assert";

export class DateRange {
    public dateFrom
    public dateTo

    constructor(dateFrom: Date, dateTo: Date) {
        this.dateFrom = dateFrom;
        this.dateTo = dateTo;

        assert(dateFrom >= dateTo)
    }

    contains(date: Date) {
        return this.dateFrom <= date || date <= this.dateTo
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