import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    EmbedBuilder,
    Message,
    Snowflake
} from "discord.js"
import {discordClient} from "./discord.js"
import {getDayNameNO} from "../common/date.js"
import {replyFoodMail} from "../mail/mail.js"
import {fetchFoodOrderByUser, FoodOrder, NO_CONVERSATION_YET} from "../database/food.js"
import {DiscordMessageReplyLogger} from "../common/logging.js"

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
    if (foodOrder.mailConvoId === NO_CONVERSATION_YET && messageCache === undefined) {
        await message.reply(":warning: Resturangen har ikke svart på bestillingen enda :warning:" +
            "\n Er du sikker på at du skal sende en ny melding med en gang?")
    }

    await confirmMessage(message)
}

export async function handleFoodMessageButtons(interaction: ButtonInteraction) {
    const foodOrder = await fetchFoodOrderByUser(interaction.user.id)
    if (!foodOrder) {
        await interaction.reply({content: "Du har ikke bestilt mat i dag :thinking:, prøvde du å bekrefte en gammel melding kanskje?"})
        return
    }

    const idTokens = interaction.customId.split("-")

    if (idTokens[1] === "confirm") {
        if (messageCache !== undefined) {
            const logger = new DiscordMessageReplyLogger(interaction)
            await logger.logLine("Sender svar til resturanten...")
            replyFoodMail(messageCache, foodOrder.mailConvoId, foodOrder.mailConvoSubject, async (err) => {
                if (err) {
                    await logger.logWarning("Det skjedde en feil når meldingen skulle bli sendt...\nMeldingen kommer ikke fram til resturanten, prøv igjen senere eller ring resturanten direkte")
                    disableButtons(interaction, "<<Error>>")
                    throw new Error("Encountered error while trying to send reply to restaurant")
                } else {
                    await logger.logLine("Meldingen din ble sendt! Hvis resturanten svarer igjen får du melding i denne kanalen.")
                    messageCache = undefined
                    disableButtons(interaction, "Melding sendt")
                }
            })
        } else {
            await interaction.reply("Du har ikke skrevet en melding å sende enda :thinking:, prøvde du kanskje å bekrefte en gammel melding?")
            return
        }
    } else if (idTokens[1] === "cancel") {
        if (messageCache === undefined) {
            await interaction.reply("Ingen melding å avbryte :thinking:, prøvde du kanskje å avbryte en gammel melding?")
            return
        }
        messageCache = undefined
        disableButtons(interaction, "Melding avbrutt!")
        await interaction.reply("Avbrutt! Hvis du vil sende en ny melding kan den skrives nå :pen_ballpoint:")
    } else {
        throw new Error("received invalid button id in food dm conversation")
    }

}

function disableButtons(interaction: ButtonInteraction, message: string) {
    const usedBuilder = new ActionRowBuilder<ButtonBuilder>()
    usedBuilder.addComponents(
        new ButtonBuilder().setCustomId("dummy1").setStyle(ButtonStyle.Secondary).setLabel(message).setDisabled(true),
        new ButtonBuilder().setCustomId("dummy2").setStyle(ButtonStyle.Secondary).setLabel(message).setDisabled(true))

    interaction.message.edit({components: [usedBuilder]})
}

async function confirmMessage(message: Message) {
    messageCache = message.content

    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Bekreft sending av melding")
    embedBuilder.setColor("Orange")
    embedBuilder.setFields({
        name: "Ønsker du å sende følgende melding til resturanten?",
        value: "\"" + messageCache + "\""
    })

    const buttons = new ActionRowBuilder<ButtonBuilder>()
    const confirmButton = new ButtonBuilder().setLabel("Bekreft").setStyle(ButtonStyle.Success).setCustomId("foodOrder-confirm")
    const cancelButton = new ButtonBuilder().setLabel("Avbryt").setStyle(ButtonStyle.Danger).setCustomId("foodOrder-cancel")
    buttons.addComponents(confirmButton, cancelButton)

    await message.reply({embeds: [embedBuilder], components: [buttons]})
}
