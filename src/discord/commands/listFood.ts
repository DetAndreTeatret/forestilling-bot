import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {fetchTodaysOrders} from "../../smartsuite/smartsuite.js"
import {PermissionLevel} from "../permission.js"
import {fetchTodaysFoodOrder} from "../../database/food.js"
import {renderDatehhmmss} from "../../common/date.js"

export const permissionLevel = PermissionLevel.HUSANSVARLIG

export const data = new SlashCommandBuilder()
    .setName("listemat")
    .setDescription("Få en liste av dagens bestillinger så langt")


export async function execute(interaction: ChatInputCommandInteraction) {
    const reply = await interaction.reply({content: "Henter matbestillinger!", ephemeral: true})
    const response = await listFood()
    await reply.edit({content: response})
}

export async function listFood() {
    const todaysOrders = await fetchTodaysOrders()

    let response = ""
    if (todaysOrders.length === 0) response = "Det er ikke gjort noen matbestillinger for denne kvelden enda!"

    const todaysMainOrder = await fetchTodaysFoodOrder()

    if (todaysMainOrder) {
        response += "\n:man_cook:Disse bestillingene ble sendt inn til restauranten kl " + renderDatehhmmss(todaysMainOrder.createdAtDate) + ":woman_cook:"
    } else response += "Dagens bestillinger så langt (Ikke sendt inn til restauranten enda :detective:)"

    const lateOrders = []
    const sentOrders = []
    for (let i = 0; i < todaysOrders.length; i++) {
        const order = todaysOrders[i]

        if (todaysMainOrder && todaysMainOrder.createdAtDate < order[1]) {
            lateOrders.push(order)
        } sentOrders.push(order[0])
    }

    sentOrders.sort()
    sentOrders.forEach(o => response += "\n- " + o)

    if (lateOrders.length > 0) {
        if (!todaysMainOrder) throw Error("Race condition")
        response += "\n\n:warning:Disse bestillingene har kommet inn etter bestillingen ble sendt til resturanten(Bestillingen ble sendt kl " + renderDatehhmmss(todaysMainOrder.createdAtDate) + "):warning:"

        for (let i = 0; i < lateOrders.length; i++) {
            const order = lateOrders[i]
            response += "\n- " + order[0] + " (Sendt inn kl **" + renderDatehhmmss(order[1]) + "**)"
        }
    }

    return response
}
