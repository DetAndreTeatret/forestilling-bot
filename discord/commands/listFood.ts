import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js"
import {PermissionLevel} from "../permission.js"
import {fetchTodaysFoodOrder} from "../../database/food.js"
import {renderDatehhmmss} from "../../util/date.js"
import {getRowsByDate} from "../../google/sheets.js"
import {EnvironmentVariable, needEnvVariable} from "../../util/config.js"

export const permissionLevel = PermissionLevel.ALL

export const data = new SlashCommandBuilder()
    .setName("listemat")
    .setDescription("Få en liste av dagens bestillinger så langt")


export async function execute(interaction: ChatInputCommandInteraction) {
    const reply = await interaction.reply({content: "Henter matbestillinger!", ephemeral: true})
    const response = await listFood()
    await reply.edit({content: response})
}

export async function listFood() {
    const todaysOrders = await fetchTodaysSubmittedOrders()

    let response = ""
    if (todaysOrders.length === 0) return "Det er ikke gjort noen matbestillinger for kveldens forestillinger enda! :poultry_leg: :yum:"

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
        } else sentOrders.push(order[0])
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

/**
 * Dependent on the column structure in the spreadsheet, expects currently(Column Letter - expected content):
 * A - Timestamp of submission (DD.MM.YYYY kl. hh.mm.ss) IN UTC+0 / GMT+0 IF NOT DAYLIGHT SAVINGS WILL DESTROY YOU :(
 * B - Name of orderer
 * C - Role of orderer
 * D - Which day the order is for, formatted as DD.MM.YYYY
 * E - The actual order
 * F - optional, an allergy if the submitter has one
 */
export async function fetchTodaysSubmittedOrders() {
    const rows = await getRowsByDate(needEnvVariable(EnvironmentVariable.FOOD_ORDER_SPREADSHEET_ID), "A2:Z", new Date(), 3, (dateString) => {
        const parts = dateString.trim().split(".").map(part => Number(part))
        return new Date(parts[2], parts[1] - 1, parts[0])
    })
    return rows.map(row => {
        const data = row.data.map(d => String(d))
        const timestampParts = data[0].split(/[. kl]+/).map(part => Number(part))
        return [`${mapOrderToPrettyOrder(data[4])} / ${data[5] === undefined ?  "" : "Allergi: " + data[5] + " / "} Navn: ${data[1]}`, new Date(Date.UTC(timestampParts[2], timestampParts[1] - 1, timestampParts[0], timestampParts[3], timestampParts[4], timestampParts[5]))] as const
    }).sort()
}

function mapOrderToPrettyOrder(order: string) {
    switch (order[0]) {
        case "A": {
            return "A: Nr 1. Thai Grønn Karri KYLLING"
        }
        case "B": {
            return "B: Nr 1. Thai Grønn Karri VEGETAR"
        }
        case "C": {
            return "C: Nr 2. Pad Thai KYLLING"
        }
        case "D": {
            return "D: Nr 2. Pad Thai BIFF"
        }
        case "E": {
            return "E: Nr 3. Thai vårrull"
        }
        case "F": {
            return "F: Nr 4. Vegetar tofu wok"
        }
    }
}
