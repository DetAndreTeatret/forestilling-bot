import {GoogleSpreadsheet} from "google-spreadsheet"
import {EnvironmentVariable, jwt, needEnvVariable} from "../common/config.js";
import {SimpleDate} from "../common/date";

enum SheetPages {
    GOOGLE_FORM_SUBMISSIONS,
    TRANSLATOR,
    TEST,
    DISPLAY //TODO Names
}

async function getFoodSheet() {
    const googleSpreadsheet = new GoogleSpreadsheet(needEnvVariable(EnvironmentVariable.GOOGLE_SPREADSHEET_ID), jwt)
    await googleSpreadsheet.loadInfo(true)

    return googleSpreadsheet
}

async function fetchRow(who: string, when: SimpleDate) {


}
