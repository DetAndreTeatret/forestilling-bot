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
import https from "https"
import {fetchUser} from "../../database/user"
import {scrapeUsers} from "schedgeup-scraper"

const DEFAULT_HENTETIDSPUNKT = "1900"

export const permissionLevel = PermissionLevel.HUSANSVARLIG

export const data = new SlashCommandBuilder()
    .setName("bestillmat")
    .setDescription("Send in matbestilling")

export async function execute(interaction: ChatInputCommandInteraction) {
    const textChannel = needNotNullOrUndefined(interaction.channel as TextChannel, "textchannel")
    const hasOrdered = await hasChannelOrdered(textChannel)
    if (hasOrdered) {
        await interaction.reply("Det er allerede bestilt mat for denne forestillingen :face_with_open_eyes_and_hand_over_mouth:! Hentetidspunkt: " + hasOrdered)
        return
    }
    const showDay = await fetchShowDayByDiscordChannel(textChannel)
    if (showDay) {
        if (showDay.dayTimeShows) {
            await interaction.reply("Denne forestillingen skjer på dagtid :baby:, og har ikke matbestilling på samme måte som kveldsforestillingene :night_with_stars:")
            return
        } else if (!isToday(showDay.when)) {
            await interaction.reply("Denne forestillingen er ikke i dag :thinking:. Du kan kun bestille mat til din forestilling samme dag som forestillingen skal foregå :sunglasses::+1:")
            return
        }
    } else {
        await interaction.reply(":no_entry_sign: Denne kanalen tilhører ikke en forestilling :no_entry_sign:, bruk denne kommandoen i en forestillingskanal for å bestille mat.")
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

export async function handleButtonPress(interaction: ButtonInteraction) {
    const idTokens = interaction.customId.split("-")

    if (idTokens[1] === "confirm") {
        const textChannel = needNotNullOrUndefined(interaction.channel as TextChannel, "textchannel")
        if (idTokens[2] === textChannel.id) {
            const orderTime = idTokens[3]
            const user = (await scrapeUsers()).find(async user => user.userId === (await fetchUser(undefined, interaction.user.id))?.schedgeUpId)
            const req = https.request(needEnvVariable(EnvironmentVariable.FOOD_ORDER_WEBHOOK).replace("%s", orderTime).replace("%t", <string>user?.phoneNumber), (res) => {
                console.log("Status code: " + res.statusCode)
            })
            req.on("error", console.log)
            req.end()
            await interaction.reply({
                content: "Matbestilling er sent av gårde med hentetidspunkt **" + orderTime + "**!",
                ephemeral: true
            })
            await markChannelAsOrdered(textChannel, orderTime)
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
