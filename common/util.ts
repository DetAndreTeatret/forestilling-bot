import {InteractionResponse} from "discord.js"

export function needNotNullOrUndefined<T>(object: T | null | undefined, errorContext: string) {
    if (object === null) {
        throw new Error("object needs to be not null and is in fact, null: " + errorContext)
    }

    if (object === undefined) {
        throw new Error("object needs to be not undefined and is in fact, undefined: " + errorContext)
    }

    return object
}

export async function editMessage(this: [InteractionResponse], newPart: string) {
    await this[0].edit(newPart)
}
