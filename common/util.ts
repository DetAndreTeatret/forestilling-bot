export function needNotNullOrUndefined<T>(object: T | null | undefined, errorContext: string) {
    if (object === null) {
        throw new Error("object needs to be not null and is in fact, null: " + errorContext)
    }

    if (object === undefined) {
        throw new Error("object needs to be not undefined and is in fact, undefined: " + errorContext)
    }

    return object
}
