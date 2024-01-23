import {EmbedBuilder, Message, Snowflake} from "discord.js"
import {discordClient} from "./discord.js"
import {getDayNameNO} from "../common/date.js"
import {replyFoodMail} from "../mail/mail.js"
import {FoodOrder, NO_CONVERSATION_YET} from "../database/food.js"

const confirm_string = ["bekreft","y","yes","confirm","bekräfta", "proceed", "engage", "accept"]

let messageCache: string | undefined = undefined

export async function receiveFoodOrderResponse(body: string, orderer: Snowflake) {
    const user = await discordClient.users.fetch(orderer)

    const today = getDayNameNO(new Date())
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Du har mottatt svar på matbestilling!! :sunglasses:")
    embedBuilder.setDescription("Ønsker deg en god " + today + " videre.")
    embedBuilder.setColor("Random")
    embedBuilder.addFields({name: "Her er meldingen", value: body})
    embedBuilder.setFooter({text: "Hvis du vil svare på meldingen, skriv svaret i denne chatten og send. Du vil bli spurt om bekreftelse før meldingen blir sendt"})

    await user.send({embeds: [embedBuilder]})
}

export async function handleFoodConversation(message: Message, foodOrder: FoodOrder) {
    if(confirm_string.includes(message.content.trim().toLowerCase())) {

        if (foodOrder.mailConvoId === NO_CONVERSATION_YET && messageCache === undefined) {
            await message.reply(":warning: Resturangen har ikke svart på bestillingen enda(meldingen vil opprette ny mail-tråd) :warning:")
            await confirmMessage(message)
        }

        if(messageCache !== undefined) {
            replyFoodMail(messageCache, foodOrder.mailConvoId, foodOrder.mailConvoSubject, async (err) => {
                if (err) {
                    throw new Error("Encountered error while trying to send reply to restaurant")
                } else {
                    await message.reply("Meldingen din ble sendt! Hvis resturanten svarer igjen får du melding i denne kanalen.")
                    messageCache = undefined
                    return
                }
            })
        } else {
            await message.reply("Du har ikke skrevet noe svar enda, skriv ditt svar i en melding til meg før du bekrefter.")
            return
        }
    } else {
        await confirmMessage(message)
    }
}

async function confirmMessage(message: Message) {
    messageCache = message.content
    await message.reply("Ønsker du å sende følgende melding til resturanten?\n```" + messageCache + "```\n\nSkriv \"bekreft\" for å sende meldingen av gårde")
}
