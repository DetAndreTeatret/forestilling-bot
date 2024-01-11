import {EmbedBuilder, Message, Snowflake} from "discord.js"
import {discordClient} from "./discord.js"
import {needNotNullOrUndefined} from "../common/util.js"
import {getDayNameNO} from "../common/date.js"
import {sendFoodMail} from "../mail/mail.js"

const confirm_string = ["Bekreft","Y","Yes","Confirm","Bekräfta"]

let messageCache: string | undefined = undefined

export async function receiveFoodOrderResponse(body: string, receiver: Snowflake) {
    const user = await discordClient.users.fetch(receiver)

    const channel = needNotNullOrUndefined(user.dmChannel, "channel@receiveFoodOrderResponse")

    const today = getDayNameNO(new Date())
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Du har mottatt svar på matbestilling!! :sunglasses:")
    embedBuilder.setDescription("Ønsker deg en god " + today + " videre.")
    embedBuilder.setColor("Random")
    embedBuilder.addFields({name: "Her er meldingen", value: body})

    channel.send({embeds: [embedBuilder]})
    channel.send("Hvis du vil svare på meldingen, skriv svaret i denne chatten og send. Du vil bli spurt om bekreftelse før meldingen blir sendt")
}

export async function handleFoodConversation(message: Message) {
    if(confirm_string.includes(message.content.trim().toLowerCase())) {
        if(messageCache !== undefined) {
            sendFoodMail(messageCache, async (err) => {
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
        messageCache = message.content
        await message.reply("Ønsker du å sende følgende melding til resturanten?\n" + messageCache + "\n\nSkriv \"Bekreft\" for å sende meldingen av gårde")
    }
}
