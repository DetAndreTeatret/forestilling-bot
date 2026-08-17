import {SmartSuiteAPI} from "smartsuite-typescript-api"
import {EnvironmentVariable, needEnvVariable} from "../util/config.js"
import {AllefolkRecord} from "smartsuite-typescript-api/dist/generatedTyping/AllefolkRecord.js"

export let personnel: SmartSuiteUser[] = []
let lastFetch = Date.now()

export interface SmartSuiteUser {
    recordID: string
    name: string
    mail: string | undefined
    roles: AllefolkRecord["rolle"]
}

export async function getPersonnel() {
    if (personnel.length !== 0 && !hasBeenTooLong()) return personnel

    if (hasBeenTooLong()) console.log("Too long since last fetch of personnel, querying SmartSuite for an updated list...")
    else console.log("First fetch of personnel, querying SmartSuite...")

    const api = new SmartSuiteAPI({
        apiKey: needEnvVariable(EnvironmentVariable.SMARTSUITE_API_KEY),
        workspaceId: needEnvVariable(EnvironmentVariable.SMARTSUITE_WORKSPACE_ID),
    })

    const everybody = await api.getRecords("Alle folk")
    personnel = everybody.map(record => {
        return {
            recordID: record.recordId,
            name: record.navn,
            mail: extractFirstOrNothing(record.ePost),
            roles: record.rolle
        } as SmartSuiteUser
    })

    lastFetch = Date.now()

    return personnel
}

export async function getSinglePersonnel(recordID: string) {
    const all = await getPersonnel()

    return all.find(p => p.recordID === recordID)
}

/**
 * Checks the diff between now and the last time personnel was fetched
 * @return true if diff is > 24h, false if < 24h
 */
function hasBeenTooLong() {
    return Date.now() - lastFetch > 1000 * 60 * 60 * 24
}

function extractFirstOrNothing<T>(arr: T[]) {
    if (arr.length > 0) return arr[0]
    else return undefined
}
