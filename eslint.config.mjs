import { defineConfig } from "eslint/config"
import datConfig from "eslint-config-dat"

export default defineConfig([
    {
        files: ["**/*.ts"],
        extends: [datConfig]
    },
    {
        ignores: ["build/*"] // node_modules ignored by default
    },
])
