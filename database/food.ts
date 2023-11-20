import {addEntry, deleteEntries, selectEntry} from "./sqlite.js"
import {Allergy, FoodChoice} from "../sheets/foodOrder.js"
import {randomUUID} from "crypto"
import {CoolUser} from "./coolUser.js"
import {Snowflake} from "discord.js"

/**
 * Checks if the user has ordered before
 * @param user
 */
export async function isFirstEverOrder(user: CoolUser) {
    return await selectEntry("FoodOrderVeterans", "UserID=" + user.userId) !== undefined
}

export async function markUserAsHasOrdered(user: CoolUser) {
    await addEntry("FoodOrderVeterans", user.userId)
}

export async function registerChangeOrderCallback(foodChoice: FoodChoice, channelId: Snowflake) {
    // Create random id
    const id = randomUUID()

    await addEntry("ChangeOrderButtonCallbackIDs", id, foodChoice, channelId)

    return id
}

export async function findChangeOrderRequest(id: string): Promise<FoodChoice | undefined> {
    const result = await selectEntry("ChangeOrderButtonCallbackIDs", "ID=\"" + id + "\"")
    if(result === undefined) return undefined
    // @ts-ignore
    return FoodChoice[result["FoodChoice"]]
}

export async function removeCallOrderCallback(id: string) {
    await deleteEntries("ChangeOrderButtonCallbackIDs", "ID=\"" + id + "\"")
}

export async function cleanupChangeOrderCallbacks(channelId: Snowflake) {
    await deleteEntries("ChangeOrderButtonCallbackIDs", "DiscordChannelSnowflake=\"" + channelId + "\"")
}

export async function setAllergyForUser(user: CoolUser, allergy: Allergy) {
    await addEntry("UserFoodAllergies", user.userId, allergy)
}

export async function isUserAllergyRegistered(user: CoolUser) {
    return await selectEntry("UserFoodAllergies", "UserID=" + user.userId) !== undefined
}

export async function getAllergyForUser(user: CoolUser) {
    const result = await selectEntry("UserFoodAllergies", "UserID=" + user.userId)
    if (result === undefined) return undefined
    return result["Allergy"]
}
