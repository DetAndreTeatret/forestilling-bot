import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {fetchTodaysOrders} from "../../smartsuite/smartsuite.js"
import {PermissionLevel} from "../permission.js"
import {fetchTodaysFoodOrder} from "../../database/food.js"
import {renderDateHHmmss} from "../../common/date.js"

export const permissionLevel = PermissionLevel.HUSANSVARLIG

export const data = new SlashCommandBuilder()
    .setName("listemat")
    .setDescription("Få en liste av dagens bestillinger så langt")


export async function execute(interaction: ChatInputCommandInteraction) {
    const response = await listFood()
    await interaction.reply({content: response, ephemeral: true})
}

export async function listFood() {
    const todaysOrders = await fetchTodaysOrders()

    let response = ""
    if (todaysOrders.length === 0) response = "Det er ikke gjort noen matbestillinger for denne kvelden enda!"

    const todaysMainOrder = await fetchTodaysFoodOrder()

    if (todaysMainOrder) {
        response += "\n:man_cook:Disse bestillingene ble sendt inn til restauranten kl " + renderDateHHmmss(todaysMainOrder.createdAtDate) + ":woman_cook:"
    } else response += "Dagens bestillinger så langt (Ikke sendt inn til restauranten enda :detective:)"

    const lateOrders = []
    for (let i = 0; i < todaysOrders.length; i++) {
        const order = todaysOrders[i]

        if (todaysMainOrder && todaysMainOrder.createdAtDate < order[1]) {
            lateOrders.push(order)
        } else response += "\n- " + order[0]
    }

    if (lateOrders.length > 0) {
        if (!todaysMainOrder) throw Error("Race condition")
        response += "\n\n:warning:Disse bestillingene har kommet inn etter bestillingen ble sendt til resturanten(Bestillingen ble sendt kl " + renderDateHHmmss(todaysMainOrder.createdAtDate) + "):warning:"

        for (let i = 0; i < lateOrders.length; i++) {
            const order = lateOrders[i]
            response += "\n- " + order[0] + " (Sendt inn kl **" + renderDateHHmmss(order[1]) + "**)"
        }
    }

    return response
}
