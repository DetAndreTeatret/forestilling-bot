export function needNotNullOrUndefined<T>(object: T | null | undefined, errorContext: string) {
    if (object == null) {
        throw new Error("object needs to be not null and is in fact, null: " + errorContext)
    }

    return object
}
