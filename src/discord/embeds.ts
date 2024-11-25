import {Collection, EmbedBuilder, Message, TextChannel,} from "discord.js"
import {Event, Worker} from "schedgeup-scraper"
import {formatLength, getDayNameNO, renderDatehhmm} from "../common/date.js"
import {EnvironmentVariable, needEnvVariable} from "../common/config.js"
import {pickRandomFOHMessage} from "../common/util.js"

/**
 * Create an event status message for the current channel. If no event info is found in the topic it will ignore the call
 */
export async function postEventInfo(channel: TextChannel, event: Event) {
    const embedToPost = createEventInfoEmbed(event.eventStartTime, event.title)
    const sentMessage = await channel.send({embeds: [embedToPost]})
    await channel.messages.pin(sentMessage)
}

export async function updateEventInfo(channel: TextChannel, eventDate: Date, showTitles: string) {
    const messages = await channel.messages.fetchPinned()
    const pinnedMessage = findPinnedEmbedMessage(PinnedEmbedMessages.EVENT_STATUS, messages)
    await pinnedMessage.edit({embeds: [createEventInfoEmbed(eventDate, showTitles)]})
}

function createEventInfoEmbed(eventDate: Date, shows: string) {
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Kanal for " + getDayNameNO(eventDate) + "s forestillinger(" + shows + ")")
    embedBuilder.setDescription("Velkommen hit! :handshake:\nOBS: Denne kanalen forsvinner når forestillingen(e) er over!")
    embedBuilder.addFields({name: "Husk å bestille mat!", value: needEnvVariable(EnvironmentVariable.FOOD_ORDER_LINK)})
    embedBuilder.addFields({name: "Skal du levere forestillingsrapport?", value: needEnvVariable(EnvironmentVariable.SHOW_REPORT_LINK)})
    embedBuilder.setColor("Random")
    embedBuilder.setImage("https://www.detandreteatret.no/uploads/assets/images/Stemning/_800x800_crop_center-center_82_none/andre-teatret-logo.png")

    return embedBuilder
}

/**
 * Post a cast list embed in the given channel, with the workers from the given events
 */
export async function postCastList(channel: TextChannel, events: Event[], daytimeshow: boolean) {
    const map = new Map<Event, Worker[]>()
    for (const event1 of events) {
        map.set(event1, event1.workers)
    }
    const embedBuilder = createCastList(map, daytimeshow)
    const message = await channel.send({embeds: [embedBuilder]})
    await channel.messages.pin(message)
}

/**
 * Update the cast list in a given channel, will replace the whole cast with workers from the given events
 */
export async function updateCastList(channel: TextChannel, events: Event[], daytimeshow: boolean) {
    const map = new Map<Event, Worker[]>()
    for (const event1 of events) {
        map.set(event1, event1.workers)
    }
    const messages = await channel.messages.fetchPinned()
    const pinnedMessage = findPinnedEmbedMessage(PinnedEmbedMessages.CAST_LIST, messages)
    await pinnedMessage.edit({embeds: [createCastList(map, daytimeshow)]})
}

const wholeDayRoles = ["Husansvarlig", "Frivillig", "Bar", "Bakvakt"]

/**
 * Create a cast list embed from a list of workers mapped to their respective events
 */
function createCastList(workersAndEvents: Map<Event, Worker[]>, daytimeshow: boolean) {
    const embedBuilder = new EmbedBuilder()
    embedBuilder.setTitle("Hvem gjør hva i " + (daytimeshow ? "dag" : "kveld") + "?")

    let first = true
    for (const entry of workersAndEvents.entries()) {
        const event = entry[0]
        const workers = entry[1]

        if (first) {
            // First, search for all workers of roles that (probably) always work on all shows in a given show day
            const allWorkers = Array.from(workersAndEvents.values()).flat()
            const allWorkersFiltered: Worker[] = []
            allWorkers.forEach(worker => {
                if (!allWorkersFiltered.some(worker0 => worker0.who === worker.who) && wholeDayRoles.includes(worker.role)) {
                    allWorkersFiltered.push(worker)
                }
            })
            const createWholeDayCastList = createCastEmbedField.bind([allWorkersFiltered, [], embedBuilder])

            const fohCallTime = new Date(event.eventStartTime)
            fohCallTime.setHours(fohCallTime.getHours() - 1)
            if (daytimeshow) {
                fohCallTime.setMinutes(fohCallTime.getMinutes() - 30)
            }

            embedBuilder.addFields({name: "<>-<>-<>" + "Front of House" + "<>-<>-<>", value: pickRandomFOHMessage() + "\nOppmøte " + renderDatehhmm(fohCallTime) + " (1 time før første show)", inline: false})
            wholeDayRoles.forEach(role => createWholeDayCastList(role))

            if (!daytimeshow) {
                fohCallTime.setMinutes(fohCallTime.getMinutes() + 5)
                embedBuilder.setDescription("Fellessamling for alle i denne kanalen på hovedscenen " + renderDatehhmm(fohCallTime) + "\n(55 minutter før første show)")
            }

            first = false
        }

        const addedWorkers: Worker[] = []
        const callTime = "Oppmøte: " + renderDatehhmm(event.eventCallTime)
        const showTime = "Varighet: " + formatLength(event.eventStartTime, event.eventEndTime)
        embedBuilder.addFields({name: "=====\n" + event.title + "\n=====", value: callTime + "\n" + showTime, inline: false})
        const createCastList = createCastEmbedField.bind([workers, addedWorkers, embedBuilder])
        createCastList("Skuespiller")
        createCastList("Lydimprovisatør")
        createCastList("Lysimprovisatør")
        createCastList("Regissør")
        const workersRest = workers.filter(w => !addedWorkers.includes(w))
        const createCastListAgain = createCastEmbedField.bind([workersRest, [], embedBuilder])
        const restRoles = workersRest.map(w => w.role)
        restRoles.filter((item, index) => restRoles.indexOf(item) === index && !wholeDayRoles.includes(item)).forEach(role => {
            createCastListAgain(role)
        })
    }

    return embedBuilder
}

/**
 * this[0] - Collection of all workers yet to use
 * this[1] - Collection of all workers used
 * this[2] - Embed add cast member field to
 * @param role the role to create embed fields from
 */
function createCastEmbedField(this: [Worker[], Worker[], EmbedBuilder], role: string) {
    const workersFiltered = this[0].filter(w => w.role === role)
    if (workersFiltered.length === 0) return
    const workerList = workersFiltered.map(w => w.who).join("\n")
    workersFiltered.forEach(w => this[1].push(w))
    this[2].addFields({name: "**" + role + "**", value: workerList, inline: true})
}

function findPinnedEmbedMessage(message: PinnedEmbedMessages, pinnedMessages: Collection<string, Message<true>>) {
    const offset = pinnedMessages.size - SYSTEM_PINNED_MESSAGES_AMOUNT
    const pinnedMessage = pinnedMessages.at(message + offset)
    if (!pinnedMessage) {
        throw new Error("Could not find pinned embed message " + message)
    } else return pinnedMessage
}

// Used in case a user pins a message in show channel after creation as an offset since pinned messages is fetched with an index
// Should be incremented if any enums is added in PinnedEmbedMessages
const SYSTEM_PINNED_MESSAGES_AMOUNT = 2

/**
 * Pinned messages are fetched from newest to oldest. (First in, last out)
 */
enum PinnedEmbedMessages {
    CAST_LIST,
    EVENT_STATUS
}
