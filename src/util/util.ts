import fs from "node:fs"
import appRootPath from "app-root-path"
import path from "node:path"

export function needNotNullOrUndefined<T>(object: T | null | undefined, errorContext: string) {
    if (object === null) {
        throw new Error("object needs to be not null and is in fact, null: " + errorContext)
    }

    if (object === undefined) {
        throw new Error("object needs to be not undefined and is in fact, undefined: " + errorContext)
    }

    return object
}

export function pickRandomFOHMessage() {
    const text = fs.readFileSync(path.join(appRootPath.toString(), "fohMessages.txt"), "utf8")
    const array = text.split(",\n")
    const randomIndex = Math.floor(Math.random() * array.length)
    return array[randomIndex]
}
