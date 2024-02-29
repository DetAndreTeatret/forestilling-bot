import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    InteractionResponse,
    ModalBuilder,
    SlashCommandBuilder,
    TextChannel,
    TextInputBuilder,
    TextInputStyle
} from "discord.js"
import {needNotNullOrUndefined} from "../../common/util.js"
import {EnvironmentVariable, needEnvVariable} from "../../common/config.js"
import {fetchShowDayByDiscordChannel} from "../../database/showday.js"
import {isToday} from "../../common/date.js"
import {PermissionLevel} from "../permission.js"
import {hasChannelOrdered, markChannelAsOrdered} from "../../database/food.js"
import {fetchUser} from "../../database/user.js"
import {scrapeUsers} from "schedgeup-scraper"
import {sendFoodMail} from "../../mail/mail.js"
import {fetchTodaysOrders} from "../../smartsuite/smartsuite.js"
import {postDebug} from "../discord.js"
import {listFood} from "./listFood.js"

const DEFAULT_HENTETIDSPUNKT = "1900"

export const permissionLevel = PermissionLevel.HUSANSVARLIG

export const data = new SlashCommandBuilder()
    .setName("bestillmat")
    .setDescription("Send in matbestilling")

export async function execute(interaction: ChatInputCommandInteraction) {
    const textChannel = needNotNullOrUndefined(interaction.channel as TextChannel, "textchannel")
    const hasOrdered = await hasChannelOrdered(textChannel.id)
    if (hasOrdered) {
        await interaction.reply({
            content: "Det er allerede bestilt mat for denne forestillingen :face_with_open_eyes_and_hand_over_mouth:! Hentetidspunkt: " + hasOrdered,
            ephemeral: true
        })
        return
    }
    const showDay = await fetchShowDayByDiscordChannel(textChannel)
    if (showDay) {
        if (showDay.dayTimeShows) {
            await interaction.reply({
                content: "Denne forestillingen skjer på dagtid :baby:, og har ikke matbestilling på samme måte som kveldsforestillingene :night_with_stars:",
                ephemeral: true
            })
            return
        } else if (!isToday(showDay.when)) {
            await interaction.reply({
                content: "Denne forestillingen er ikke i dag :thinking:. Du kan kun bestille mat til din forestilling samme dag som forestillingen skal foregå :sunglasses::+1:",
                ephemeral: true
            })
            return
        }
    } else {
        await interaction.reply({
            content: ":no_entry_sign: Denne kanalen tilhører ikke en forestilling :no_entry_sign:, bruk denne kommandoen i en forestillingskanal for å bestille mat.",
            ephemeral: true
        })
        return
    }
    const response = await interaction.reply(createConfirmationMessage(needNotNullOrUndefined(interaction.channel as TextChannel, "textchannel"), DEFAULT_HENTETIDSPUNKT))
    startTimeout(response, 14)
}

function createConfirmationMessage(channel: TextChannel, time: string) {
    const builder = new ActionRowBuilder<ButtonBuilder>()

    builder.addComponents(new ButtonBuilder().setCustomId("food-confirm-" + channel.id + "-" + time).setLabel("Bekreft(Med hentetidspunkt kl " + time + ")").setStyle(ButtonStyle.Success))
    builder.addComponents(new ButtonBuilder().setCustomId("food-confirm-custom-time").setLabel("Endre hentetidspunkt").setStyle(ButtonStyle.Primary))
    builder.addComponents(new ButtonBuilder().setCustomId("food-cancel").setLabel("Avbryt").setStyle(ButtonStyle.Danger))

    return {
        components: [builder], content: "Du bestiller nå mat for kveldens forestilling til kl **" + time + "**. " +
            "\nHusk at bestillinger som kommer etter du trykker \"Bekreft\" ikke vil bli inkludert i bestillingen!"
        , ephemeral: true
    }
}

export async function handleFoodOrderButtons(interaction: ButtonInteraction) {
    const idTokens = interaction.customId.split("-")

    if (idTokens[1] === "confirm") {
        const textChannel = needNotNullOrUndefined(interaction.channel as TextChannel, "textchannel")
        if (idTokens[2] === textChannel.id) {
            await interaction.reply({ // TODO convert to logger
                content: "Forbereder sending av matbestilling...",
                ephemeral: true
            })
            const pickupTime = idTokens[3]
            const user = await fetchUser(undefined, interaction.user.id)
            if (!user) throw new Error("User not found during food order :(") // TODO, find out how to tell command user that error was thrown
            const schedgeUpUser = (await scrapeUsers([user.schedgeUpId]))[0]
            if (!schedgeUpUser) throw new Error("SchedgeUpUser not found during food order :(")
            let phoneNumber: string

            if (schedgeUpUser.phoneNumber === null) {
                phoneNumber = needEnvVariable(EnvironmentVariable.BACKUP_NUMBER_FOOD_ORDER)
                console.warn("====User " + schedgeUpUser.displayName + " does not have a stored phone number, backup number was used====")
            } else {
                phoneNumber = schedgeUpUser.phoneNumber
            }

            const todaysOrders = await fetchTodaysOrders()
            if (todaysOrders.length === 0) {
                await interaction.editReply("Det er ingen som har bestilt mat i dag! \nMatbestilling ble ikke sendt")
                return
            }

            await interaction.editReply({
                content: "Sender matbestilling...",
            })

            const error = await sendFoodMail(createOrderMailBody(todaysOrders.map(o => o[0]).sort(), pickupTime, phoneNumber))
            if (error) {
                throw error
            }

            await interaction.editReply({
                content: "Matbestilling er sent av gårde med hentetidspunkt **" + pickupTime + "**!",
            })
            await postDebug("Dagens mat er herved bestilt!(Hentetidspunkt: " + pickupTime + ",Bestilt av: " + interaction.user.displayName + ")")
            await markChannelAsOrdered(textChannel, pickupTime, interaction.user.id)
            await postDebug(await listFood())
            return
        } else if (idTokens[2] === "custom") {
            await interaction.showModal(createCustomTimeModal())
            const response = await interaction.awaitModalSubmit({
                time: 60000,
                filter: i => i.user.id === interaction.user.id
            })
            const interactionResponse = await response.reply(createConfirmationMessage(textChannel, response.fields.getTextInputValue("food-enter-custom-time")))
            startTimeout(interactionResponse, 13)
            return
        }
    } else if (idTokens[1] === "cancel") {
        await interaction.reply({
            content: "Du har avbrutt matbestilling, bruk /matbestilling for å starte på nytt igjen",
            ephemeral: true
        })
        return
    }

    throw new Error("Invalid button id passed to orderfood: " + idTokens.join("-"))
}

function startTimeout(response: InteractionResponse, length: number) {
    const usedBuilder = new ActionRowBuilder<ButtonBuilder>()
    usedBuilder.addComponents(
        new ButtonBuilder().setCustomId("dummy1").setStyle(ButtonStyle.Secondary).setLabel("Gammel melding").setDisabled(true),
        new ButtonBuilder().setCustomId("dummy2").setStyle(ButtonStyle.Secondary).setLabel("Bruk /bestillmat for å").setDisabled(true),
        new ButtonBuilder().setCustomId("dummy3").setStyle(ButtonStyle.Secondary).setLabel("starte på nytt").setDisabled(true))

    setTimeout(() => response.edit({components: [usedBuilder]}), 1000 * length)
}

function createCustomTimeModal() {
    const modalBuilder = new ModalBuilder()
    modalBuilder.setCustomId("food-custom-time-modal")
    modalBuilder.setTitle("Velg hentetidspunkt")

    const enterText = new TextInputBuilder()
    enterText.setCustomId("food-enter-custom-time")
    enterText.setLabel("Hentetidspunkt")
    enterText.setMaxLength(4)
    enterText.setMinLength(4)
    enterText.setRequired(true)
    enterText.setPlaceholder("1300")
    enterText.setStyle(TextInputStyle.Short)

    const rowBuilder = new ActionRowBuilder<TextInputBuilder>()
    rowBuilder.addComponents(enterText)
    modalBuilder.addComponents(rowBuilder)

    return modalBuilder
}

function createOrderMailBody(orders: string[], orderTime: string, ordererNumber: string) {
    let body = "Hei! Vi ønsker å bestille følgende:"

    for (let i = 0; i < orders.length; i++) {
        body += "\n" + orders[i]
    }

    body += "\n\nAntall bestillinger: " + orders.length
    body += "\n\n\nVi kommer og henter ca " + orderTime
    body += "\nOm det oppstår forsinkelser, vennligst ring: " + ordererNumber

    body += "\nMvh\nDet Andre Teatret"

    return body
}
