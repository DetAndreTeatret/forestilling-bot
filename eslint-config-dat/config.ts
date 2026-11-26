import jsdoc from "eslint-plugin-jsdoc"
import stylistic from "@stylistic/eslint-plugin"
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import {defineConfig} from "eslint/config"

export default defineConfig(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            "jsdoc": jsdoc,
            "@stylistic": stylistic
        },
        rules: {
            // CODE
            "@typescript-eslint/ban-ts-comment": "off",
            "no-duplicate-imports": "error",
            "no-self-compare": "error",
            "no-unreachable-loop": "error",
            "no-unused-private-class-members": "warn",
            "eqeqeq": ["error", "smart"],
            "no-lone-blocks": "error",
            "no-var": "error",

            // CODE STYLE
            "@stylistic/semi": ["warn", "never"],
            "@stylistic/spaced-comment": ["warn", "always", {
                "block": {
                    "balanced": true
                }
            }],
            "@stylistic/no-trailing-spaces": "warn",
            "@stylistic/keyword-spacing": "error",
            "@stylistic/padding-line-between-statements": ["error", // Order is important!
                {"blankLine": "always", "prev": "import", "next": "*"},
                {"blankLine": "never", "prev": "import", "next": "import"},
                {"blankLine": "always", "prev": "*", "next": "function"},
                {"blankLine": "always", "prev": "*", "next": {"selector": "ExportNamedDeclaration > FunctionDeclaration"}},
                {"blankLine": "always", "prev": "*", "next": "class"}
            ],
            "@stylistic/quotes": ["warn", "double"], // Template literals are allowed,
            "@stylistic/eol-last": "warn",

            // JSDOC
            "jsdoc/no-undefined-types": "warn"
        }
    }
)
