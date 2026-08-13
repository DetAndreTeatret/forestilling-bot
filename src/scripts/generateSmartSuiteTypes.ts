import {generateTableTypings, SmartSuiteAPI} from "smartsuite-typescript-api"
import {EnvironmentVariable, needEnvVariable, setupConfig} from "../util/config.js"

// STANDALONE SCRIPT
// Used to update typings for SmartSuite tables
// Is never ran along the main bot, and is expected to be run as a standalone node script
// use "npm run generateSmartSuiteTypes" to run this code

setupConfig()

const api = new SmartSuiteAPI({
    apiKey: needEnvVariable(EnvironmentVariable.SMARTSUITE_API_KEY),
    workspaceId: needEnvVariable(EnvironmentVariable.SMARTSUITE_WORKSPACE_ID),
})

async function generateTypes() {
    const tables = await api.getTables("650d4178fc2de4faa605d647") // TODO sensitive?
    for (const t of tables) {
        await generateTableTypings(t, {
            forceCamelCase: true,
        })
    }

}

generateTypes().then(() => {
    console.log("Generated types for SmartSuite types")
    process.exit(0)
})
