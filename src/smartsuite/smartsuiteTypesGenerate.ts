import {generateTableTypings, SmartSuiteAPI} from "smartsuite-typescript-api"
import {EnvironmentVariable, needEnvVariable} from "../util/config.js"
import {configDotenv} from "dotenv"

configDotenv()

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
    console.log("Generated types for smartsuite types")
    process.exit(0)
})
