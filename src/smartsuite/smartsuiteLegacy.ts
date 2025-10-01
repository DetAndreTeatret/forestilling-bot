import https from "https"
import {EnvironmentVariable, needEnvVariable} from "../util/config.js"
import {isToday} from "../util/date.js"

const LIST_TABLE_URL_FORMAT = "/%t/records/list/"

export async function sendSmartSuiteRequest(path: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const req =
            https.request({
                hostname: "app.smartsuite.com",
                path: "/api/v1/applications" + path,
                method: "POST",
                headers: {
                    "Authorization": "Token " + needEnvVariable(EnvironmentVariable.SMARTSUITE_API_KEY),
                    "Account-ID": needEnvVariable(EnvironmentVariable.SMARTSUITE_WORKSPACE_ID)
                },
            }, (res) => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    return reject(new Error(`Status Code: ${res.statusCode}`))
                }
                res.setEncoding("utf8")
                let json = ""
                res.on("data", (data) => {
                    json += data
                })
                res.on("end", () => resolve(JSON.parse(json.replaceAll("\n", "").trim())))
            })
        req.on("error", console.error)
        req.end()
    })
}

export async function fetchTodaysOrders(): Promise<[string, Date][]> {
    // @ts-ignore
    const result = (await sendSmartSuiteRequest(LIST_TABLE_URL_FORMAT.replace("%t", needEnvVariable(EnvironmentVariable.SMARTSUITE_BESTILLINGER_TABLE_ID))))["items"]

    const todaysOrders = []

    for (let i = 0; i < result.length; i++) {
        const date = new Date(result[i][needEnvVariable(EnvironmentVariable.SMARTSUITE_BESTILLINGER_FIELD_ID)].date)
        if (isToday(date)) {
            todaysOrders.push(result[i])
        }
    }

    return todaysOrders.map(o => [o.title, new Date(o.first_created.on)])
}
