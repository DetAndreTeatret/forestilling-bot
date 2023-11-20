// Create food embed

// Create food buttons that link to the food order file
import {ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder, TextChannel} from "discord.js"
import {checkCurrentOrder, FoodChoice, foodChoiceValues, orderFood, Role, updateOrder} from "../sheets/foodOrder.js"
import {SimpleDate} from "../common/date.js"
import {
    findChangeOrderRequest,
    getAllergyForUser,
    isFirstEverOrder,
    markUserAsHasOrdered,
    registerChangeOrderCallback, removeCallOrderCallback
} from "../database/food.js"
import {fetchShowDayByDiscordChannel} from "../database/showday.js"
import {findPinnedEmbedMessage, PinnedEmbedMessages} from "./discord.js"
import {fetchUser} from "../database/coolUser.js"
import {needDatabase} from "../database/sqlite.js"
import {needNotNullOrUndefined} from "../common/util.js"

const ALPHABET_EMOJIES = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬"]
const START_OF_ALPHABET = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"]

const BUTTON_CALLBACK_ID_PREFIX = "food"
const BUTTON_CALLBACK_ID_SEPERATOR = "_"

// Example: "food_order_162387126381273_A"
const BUTTON_CALLBACK_ID_FORMAT_ORDER = BUTTON_CALLBACK_ID_PREFIX + "_order_%discordChannelSnowflake%_%alphabetKey%"

// Example: "food_changeOrder_a7S2-ADsd-ASD2-d2da_confirm"
const BUTTON_CALLBACK_ID_FORMAT_CHANGEORDER = BUTTON_CALLBACK_ID_PREFIX + "_changeOrder_%callbackID%_%status%"

export async function createAndSendFoodOrderEmbed(channel: TextChannel) {
    const embedBuilder = new EmbedBuilder()

    embedBuilder.setTitle("Matbestilling")
    embedBuilder.setDescription("Husk å bestille mat før kl 1700 kvelden du skal jobbe! " +
        "Hvis du bestiller senere enn dette er det ikke garantert at du får mat selv om du bestiller.")
    embedBuilder.addFields(
        {
            name: "Hvordan bestille:",
            value: "For å bestille mat trykker du på en av reaksjonene på denne meldingen.\n" +
                "OBS: Når du trykker kan du få ett eller flere oppfølgingsspørsmål, så husk å lese det og svar som instruert i spørsmålet.\n" +
                "\n" +
                "Hver reaksjon har en tilhørende rett, se på menyen for å se hva hver reaksjon betyr."
        })

    let menu = ""
    let menuLength = 0
    for (const foodChoiceValue of foodChoiceValues) {
        menuLength++
        menu += foodChoiceValue
        menu += "\n"
    }

    embedBuilder.addFields(
        {
            name: "Meny",
            value: menu
        })

    const buttons: ButtonBuilder[] = []

    for (let i = 0; i < menuLength; i++) {
        const button = new ButtonBuilder()
        const alphabetKey = START_OF_ALPHABET[i]
        button.setLabel(alphabetKey)
        button.setStyle(ButtonStyle.Primary)
        button.setEmoji(ALPHABET_EMOJIES[i])
        button.setCustomId(BUTTON_CALLBACK_ID_FORMAT_ORDER.replace("%discordChannelSnowflake%", channel.id).replace("%alphabetKey%", alphabetKey))
        buttons.push(button)
    }

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5))
    const buttonRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(5, 10))

    const message = await channel.send(
        {
            embeds: [embedBuilder],
            components: [buttonRow, buttonRow2]
        })
    await message.pin()
}

export async function consumeFoodButton(interaction: ButtonInteraction) {
    const id = interaction.customId.split(BUTTON_CALLBACK_ID_SEPERATOR)

    if (id[1] === "order") {
        await consumeFoodOrderPress(interaction)
    } else if (id[1] === "changeOrder") {
        await consumeChangeOrderButton(interaction)
    } else {
        console.log("Unknown button received :( " + id)
    }
}

export async function consumeFoodOrderPress(interaction: ButtonInteraction) {
    const member = interaction.member
    const channel = interaction.channel as TextChannel
    if (member === null || channel === null) return // TODO
    const user = needDatabase(await fetchUser(undefined, member.user.id), "user")
    const foodChoice = extractFoodOrderButtonInfo(interaction.customId, channel)
    if (foodChoice === null) return

    const currentOrder = await checkCurrentOrder(user.displayName, new SimpleDate())

    if (currentOrder) {
        // The user currently has an order, check if user want to update it
        await createAndSendFoodUpdateRequestEmbed(currentOrder, foodChoice, interaction)
    } else {
        // The user does not have a current order

        // Has the user ever ordered food?
        if (!(await isFirstEverOrder(user))) {
            // Allergy embed thing


            await markUserAsHasOrdered(user)
        } else {
            const showDay = await fetchShowDayByDiscordChannel(channel.id)
            if (showDay === undefined) throw new Error("Could not find channel belonging to button...")

            const castList = findPinnedEmbedMessage(PinnedEmbedMessages.CAST_LIST, await channel.messages.fetchPinned())
            let role: Role | undefined
            castList.embeds[0].fields.forEach(field => {
                if (field.value.includes(user.displayName)) {
                    // @ts-ignore
                    role = Role[field.name.toUpperCase()]
                    return
                }
            })
            if (role === undefined) throw new Error("Cant find role for user") // TODO, for users in channel not in show

            const allergy = needDatabase(await getAllergyForUser(user), "allergy")

            // Send order
            await orderFood(user.displayName, new SimpleDate(showDay.when), foodChoice, role, allergy)
        }
    }
}

/**
 * Checks for the callback prefix and checks that the channel of the button id and interaction channel matches
 */
function extractFoodOrderButtonInfo(buttonId: string, channel: TextChannel): FoodChoice | null {
    const split = buttonId.split(BUTTON_CALLBACK_ID_SEPERATOR)
    if (split.length === 0 || split[0] !== BUTTON_CALLBACK_ID_PREFIX) return null

    if (split[2] !== channel.id) throw new Error("Button id does not match the channel of the interaction")

    // @ts-ignore
    return FoodChoice[split[3].toUpperCase()]
}

async function createAndSendFoodUpdateRequestEmbed(currentOrder: FoodChoice, queriedOrder: FoodChoice, interaction: ButtonInteraction) {
    const embedBuilder = new EmbedBuilder()

    embedBuilder.setTitle("Endre matbestilling?")
    embedBuilder.setDescription(
        "Ser ut som du allerede har bestilt " + currentOrder + " for kveldens forestilling." +
        "Vil du endre bestillingen til " + queriedOrder + " ?"
    )

    const callbackId = await registerChangeOrderCallback(currentOrder, needNotNullOrUndefined(interaction.channel, "channel").id)

    const confirmButton = new ButtonBuilder()
        .setLabel("Bekreft")
        .setStyle(ButtonStyle.Primary)
        .setCustomId(BUTTON_CALLBACK_ID_FORMAT_CHANGEORDER.replace("%status%", "confirm").replace("%callbackID%", callbackId))
    const cancelButton = new ButtonBuilder()
        .setLabel("Avbryt")
        .setCustomId(BUTTON_CALLBACK_ID_FORMAT_CHANGEORDER.replace("%status%", "cancel").replace("%callbackID%", callbackId))
        .setStyle(ButtonStyle.Danger)
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton)

    await interaction.reply({embeds: [embedBuilder], components: [actionRow]})
}

async function consumeChangeOrderButton(interaction: ButtonInteraction) {
    const buttonInfo = interaction.customId.split(BUTTON_CALLBACK_ID_SEPERATOR)

    const callbackId = buttonInfo[2]
    const status = buttonInfo[3]

    const callbackFoodOrder = needDatabase(await findChangeOrderRequest(callbackId), "foodOrder")

    if (status === "confirm") {
        const user = needDatabase(await fetchUser(undefined, interaction.user.id), "user")
        const showDay = needNotNullOrUndefined(await fetchShowDayByDiscordChannel(needNotNullOrUndefined(interaction.channel, "channel").id), "showDay")
        await updateOrder(user.displayName, showDay.when, callbackFoodOrder)
        await removeCallOrderCallback(callbackId)
    } else if (status === "cancel") {
        await removeCallOrderCallback(callbackId)
    } else {
        throw new Error("Unknown state returned from change order button")
    }
}
