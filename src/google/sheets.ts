import {sheetsClient} from "./clients.js"
import {renderDateYYYYMMDD} from "../util/date.js"

export interface SheetRowResult {
    rowIndex: number // relative to the rows returned, not total in the sheet
    timestamp: Date
    data: (string | number | boolean)[]
}

/**
 * Fetches rows from a sheet range where the given column matches a target date (YYYY-MM-DD).
 * @param spreadsheetId the id of the Google Sheet to fetch rows from
 * @param range the range (e.g 'Sheet 1'!A:Z)
 * @param targetDate the date to filter result rows by before returning
 * @param dateColumnIndex the column index to look for the date in the row
 * @param customDateParser
 */
export async function getRowsByDate(spreadsheetId: string, range: string, targetDate: Date, dateColumnIndex: number, customDateParser?: (dateString: string) => Date): Promise<SheetRowResult[]> {
    const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range
    })

    const rows = response.data.values
    if (!rows || rows.length === 0) {
        return []
    }

    const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate
    if (isNaN(target.getTime())) {
        throw new Error(`Invalid targetDate: ${targetDate}`)
    }

    const targetDateStr = renderDateYYYYMMDD(target)
    const matchedRows: SheetRowResult[] = []

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue

        const rawDateString = row[dateColumnIndex]
        if (!rawDateString) continue

        const rowDate = customDateParser ? customDateParser(rawDateString) : new Date(rawDateString)

        if (rowDate && !isNaN(rowDate.getTime())) {
            if (renderDateYYYYMMDD(rowDate) === targetDateStr) {
                matchedRows.push({
                    rowIndex: i,
                    timestamp: rowDate,
                    data: row,
                })
            }
        }
    }

    return matchedRows
}
