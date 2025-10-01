import {
    ActionRowBuilder, AnySelectMenuInteraction,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    ChatInputCommandInteraction,
    EmbedBuilder,
    GuildChannel, InteractionWebhook,
    MessageFlagsBitField,
    MessageReaction,
    ModalBuilder,
    ModalSubmitInteraction,
    Role, RoleSelectMenuBuilder,
    RoleTagData,
    SlashCommandBuilder,
    Snowflake, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
    User, UserSelectMenuBuilder
} from "discord.js"
import {needNotNullOrUndefined} from "../../../util/util.js"
import {
    addNonRespondant,
    createDatabaseAnnouncement,
    needResponseData, removeNonRespondant
} from "../../../database/discord.js"
import {renderDateMMDDhh} from "../../../util/date.js"
import {discordClient, DiscordEmojiEvent} from "../../client.js"
import {addNagJob} from "../../../util/announcementNaggingMessageQueue.js"

const wipAnnouncements: Map<string, Announcement> = new Map()

const DAY_IN_MILLISECONDS = 24*60*60*1000

export type LegalEmoijiesKey = typeof legalEmojiSets[number]["key"]

const legalEmojiSets = [{
    key: "Ja/Nei",
    names: ["👍", "👎"], // U+1F44D (thumbs up), U+1F44E (thumbs down)
    ids: [null, null]
}, {
    key: "Ja/Nei/Kanskje",
    names: ["Ja", "Nei", "🤷"],
    ids: ["1024249472668151808", "1024249582739267654", null]
}, {
    key: "Lest",
    names: ["Lest"],
    ids: ["1024978383307817020"]
}] as const


interface NagAction {
    readonly hours: number
    readonly discord: boolean
    readonly mail: boolean
}

/**
 * Defaults to Discord only when only hours are provided
 */
function nag(hours: number, discord: boolean = true, mail: boolean = false): NagAction {
    return {hours: hours, discord: discord, mail: mail}
}

export type NaggingRulesKey = keyof typeof naggingRules

// Strategies for nagging over time, each number is the number of hours after the last nag
// The last number will be repeated until nagging stops (e.g, 1 hour interval nagging until the respondent finally responds)
// The first number is after the initial deadline, so each first step here is really the second nag
export const naggingRules = {
    // After 2 hours send a mail
    // After 4 hours send a Discord msg and mail, forever
    "ASAP": [nag(2, false, true), nag(4, true, true)],
    // After 24 hours send a Discord msg
    // After 12 hours send a mail
    // After 12 hours send a Discord msg
    // After 12 hours send a Discord msg and mail forever
    "Quick": [nag(24), nag(12, false, true), nag(12), nag(12, true, true)],
    // After 48 hours send a Discord msg TODO is this too slow first nag?
    // After 12 hours send a mail
    // After 24 hours send a Discord msg
    // After 24 hours send a Discord msg and mail
    // After 12 hours send a Discord msg
    // After 12 hours send a Discord msg and mail, forever
    "Chill": [nag(48), nag(12, false, true), nag(24), nag(24, true, true), nag(12), nag(12, true, true)]
} as const

export class Announcement {
    readonly owner: User
    readonly channel: GuildChannel
    title: string
    content: string
    // The deadline before nagging starts, when hit a Discord message is sent, subsequent nags are defined in the ruleset "naggingRule"
    deadline: string
    messageWebhook: InteractionWebhook

    // These values are not known at initiation of creation
    nagUsers: Snowflake[]
    nagRoles: Snowflake[]
    // The rule describe the strategy for nagging over time after the deadline has been reached
    // Se const for how logic should work
    naggingRule?: NaggingRulesKey
    // Which emojies are to be used as reaction reply options?
    legalEmojies?: LegalEmoijiesKey

    constructor(owner: User, channel: GuildChannel, title: string, content: string, deadline: string, messageWebhook: InteractionWebhook) {
        this.owner = owner
        this.channel = channel
        this.title = title
        this.content = content
        this.deadline = deadline
        this.messageWebhook = messageWebhook
        this.nagUsers = []
        this.nagRoles = []
    }

    nagWho(channel: GuildChannel) {
        const result = [""].concat(this.nagUsers)
        channel.members.forEach(member => {
            for (const role of this.nagRoles) {
                if (member.roles.cache.has(role)) result.push(member.id)
            }
        })
        return result.filter((id, i) => !(id === "" || result.indexOf(id) !== i))
    }

    hasAnyToNag() {
        return this.nagUsers.length > 0 || this.nagRoles.length > 0
    }
}

export const data = new SlashCommandBuilder()
    .setName("kunngjøring")
    .setDescription("Lag en kunngjøring, maser automatisk på folk som ikke svarer!")

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.showModal(createContentModal())
}

function createContentModal(announcementWebhookID?: string, existingTitle?: string, existingContent?: string, existingDeadline?: string) {
    const modalBuilder = new ModalBuilder()
    modalBuilder.setCustomId(customID("modal", "container", announcementWebhookID))
    modalBuilder.setTitle("Kunngjøring")

    const title = new TextInputBuilder({
        customId: customID("modal", "title"),
        label: "Tittel",
        required: true,
        style: TextInputStyle.Short,
        placeholder: "En tittel for denne kunngjøringen",
        value: existingTitle
    })

    const content = new TextInputBuilder({
        customId: customID("modal", "content"),
        label: "Innhold",
        required: true,
        style: TextInputStyle.Paragraph,
        placeholder: "Putt inn noe innhold her", // TODO guide for formatering: https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline")
        value: existingContent
    })

    const deadline = new TextInputBuilder({
        customId: customID("modal", "deadline"),
        label: "Svarfrist",
        required: true,
        style: TextInputStyle.Short,
        placeholder: "Bare tall tolkes som dager, tall + 't' blir timer(f.eks 12t eller 36t)",
        value: existingDeadline
    })

    modalBuilder.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(title),
        new ActionRowBuilder<TextInputBuilder>().addComponents(content),
        new ActionRowBuilder<TextInputBuilder>().addComponents(deadline)
    )

    return modalBuilder
}

export async function handleAnnouncementTextSubmit(interaction: ModalSubmitInteraction) {
    const title = interaction.fields.getTextInputValue(customID("modal", "title"))
    const text = interaction.fields.getTextInputValue(customID("modal", "content"))
    const deadline = interaction.fields.getTextInputValue(customID("modal", "deadline"))
    const channel = interaction.channel as GuildChannel
    const rolesInChannel: Map<Role, number> = new Map()

    let announcementWebhookID = interaction.customId.split("-")[3]
    if (announcementWebhookID && announcementWebhookID !== "") {
        const announcement = needNotNullOrUndefined(wipAnnouncements.get(announcementWebhookID), "existing announcement from modal submit")
        announcement.title = title
        announcement.content = text
        announcement.deadline = deadline
        await announcement.messageWebhook.editMessage("@original", {
            embeds: [createAnnouncementWorkingEmbed(title, text, deadline)],
        })

        await interaction.deferUpdate()
    } else {
        announcementWebhookID = interaction.webhook.id

        channel.members.forEach(member => {
            member.roles.cache.forEach(role => {
                if (shouldIgnoreRole(role.tags)) return
                const currentCounter = rolesInChannel.get(role)
                rolesInChannel.set(role, currentCounter ? currentCounter + 1 : 1)
            })
        })

        const rolesPicker = new RoleSelectMenuBuilder({
            customId: customID("picker", "roles", announcementWebhookID),
            minValues: 1,
            maxValues: 25,
            placeholder: "Velg hvem som skal mases på per rolle (kan blandes med brukere)"
        })

        const userPicker = new UserSelectMenuBuilder({
            customId: customID("picker", "users", announcementWebhookID),
            minValues: 1,
            maxValues: 25,
            placeholder: "Velg hvem som skal mases på per bruker (kan blandes med roller)"
        })

        const naggingRulesPicker = new StringSelectMenuBuilder({
            customId: customID("picker", "nagging", announcementWebhookID),
            minValues: 1,
            maxValues: 1,
            placeholder: "Velg en masestrategi"
        })

        naggingRulesPicker.addOptions(Object.entries(naggingRules).map(rule =>
            new StringSelectMenuOptionBuilder({
                label: rule[0],
                value: rule[0]
            })))

        const legalEmojiesPicker = new StringSelectMenuBuilder({
            customId: customID("picker", "emojis", announcementWebhookID),
            minValues: 1,
            maxValues: 1,
            placeholder: "Velg hvilke reaksjoner som kan brukes til å svare"
        })

        legalEmojiesPicker.addOptions(legalEmojiSets.map(emojiSet =>
            new StringSelectMenuOptionBuilder({
                label: emojiSet.key,
                description: emojiSet.names.join(" / "),
                value: emojiSet.key
            })
        ))

        const confirmButton = new ButtonBuilder({
            label: "Bekreft og send",
            customId: customID("button", "confirm", announcementWebhookID),
            style: ButtonStyle.Success,
        })

        const cancelButton = new ButtonBuilder({
            label: "Avbryt",
            customId: customID("button", "cancel", announcementWebhookID),
            style: ButtonStyle.Danger,
        })

        const changeContentButton = new ButtonBuilder({
            label: "Endre tekstinnhold",
            customId: customID("button", "changecontent", announcementWebhookID),
            style: ButtonStyle.Primary,
        })

        await interaction.reply({
            embeds: [createAnnouncementWorkingEmbed(title, text, deadline)],
            components: [
                new ActionRowBuilder<RoleSelectMenuBuilder>({components: [rolesPicker]}),
                new ActionRowBuilder<UserSelectMenuBuilder>({components: [userPicker]}),
                new ActionRowBuilder<StringSelectMenuBuilder>({components: [naggingRulesPicker]}),
                new ActionRowBuilder<StringSelectMenuBuilder>({components: [legalEmojiesPicker]}),
                new ActionRowBuilder<ButtonBuilder>({components: [changeContentButton, cancelButton, confirmButton]})
            ],
            flags: MessageFlagsBitField.Flags.Ephemeral
        })

        wipAnnouncements.set(interaction.webhook.id, new Announcement(interaction.user, channel, title, text, deadline, interaction.webhook))
    }
}

function createAnnouncementWorkingEmbed(title: string, content: string, deadline: string) {
    const embed = new EmbedBuilder()

    embed.setTitle("Arbeidsvindu for ny kunngjøring")
    embed.setDescription("Her ser du foreløpig info til din nye kunngjøring, bruk knappene nederst for å endre innholdet eller andre ting")
    embed.addFields({name: "Tittel", value: title})
    embed.addFields({name: "Foreløpig innhold", value: content, inline: false})
    embed.addFields({name: "Svarfrist", value: renderDateMMDDhh(parseAnnouncementDeadline(deadline))})

    return embed
}

export async function handleAnnouncementWorkMenuSelect(interaction: AnySelectMenuInteraction) {
    const path = interaction.customId.split("-")
    const which = path[2]
    const announcementWebhookID = path[3]

    const announcement = needNotNullOrUndefined(wipAnnouncements.get(announcementWebhookID), "handleAnnouncementWorkMenuSelect for " + interaction + " entries: " + wipAnnouncements.keys())

    switch (which) {
        case "roles": {
            announcement.nagRoles = interaction.values
            break
        }
        case "users": {
            announcement.nagUsers = interaction.values
            break
        }
        case "emojis": {
            if (!isValidEmojiSetKey(interaction.values[0])) throw new Error("Uh oh invalid emoji key")
            announcement.legalEmojies = interaction.values[0]
            break
        }
        case "nagging": {
            if (!isValidNaggingKey(interaction.values[0])) throw new Error("Uh oh invalid nagging key")
            announcement.naggingRule = interaction.values[0]
            break
        }
        default:
            throw new Error("Invalid select menu...")
    }

    await interaction.deferUpdate()
}

export async function handleAnnouncementWorkButton(interaction: ButtonInteraction) {
    const path = interaction.customId.split("-")
    const announcementWebhookID = path[3]
    const announcement = needNotNullOrUndefined(wipAnnouncements.get(announcementWebhookID), "handleAnnouncementWorkButton for " + interaction)

    switch (path[2]) {
        case "confirm": {
            const check = canActivateAnnouncement(announcement)
            if (typeof check === "string") {
                await interaction.reply({
                    content: "Ops! Det mangler noe nødvendig informasjon før denne kunngjøringen kan postes:\n\n**" + check + "**",
                    flags: MessageFlagsBitField.Flags.Ephemeral
                })
                return
            }
            const builder = new ActionRowBuilder<ButtonBuilder>()
            builder.addComponents(new ButtonBuilder()
                .setCustomId(customID("button", "activate", announcementWebhookID))
                .setLabel("Bekreft")
                .setStyle(ButtonStyle.Success))
            await interaction.reply({
                components: [builder],
                content: `Er du sikker på at du er ferdig å bygge kunngjøringen? Når den først er satt i gang kan kun innhold endres. Hvis du ikke vil bekrefte bare ignorer/skjul denne meldingen.\nForeløpig frist satt til ${renderDateMMDDhh(parseAnnouncementDeadline(announcement.deadline))}`,
                flags: MessageFlagsBitField.Flags.Ephemeral
            })
            break
        }
        case "cancel": {
            await announcement.messageWebhook.editMessage("@original", "Denne meldingen var en kunngjøring, men er nå slettet")
            wipAnnouncements.delete(interaction.message.id)
            break
        }
        case "changecontent": {
            const modal = createContentModal(announcement.messageWebhook.id, announcement.title, announcement.content, announcement.deadline)
            await interaction.showModal(modal)

            break
        }
        case "activate": {
            const channel = interaction.message.channel
            if (channel.type !== ChannelType.GuildText) throw new Error("Invalid state uh oh")
            await interaction.deferUpdate()
            await activateAnnouncement(announcement, channel)
            await interaction.webhook.editMessage("@original", "Kunngjøring har blitt aktivert! Denne meldingen kan nå skjules")
            break
        }
        default:
            throw new Error("Received invalid announcement work button " + path)
    }
}

/**
 * Checks if necessary information on an announcement is present before publishing
 *
 * @return true if necessary info is present, if an error is found an error string is returned describing whats missing
 * @param announcement
 */
function canActivateAnnouncement(announcement: Announcement) {
    const errors: string[] = []
    if (!announcement.legalEmojies) errors.push("- Reaksjoner for å svare er ikke definert")
    if (!announcement.naggingRule) errors.push("- Masestrategi er ikke valgt")
    if (!announcement.hasAnyToNag()) errors.push("- Kunngjøringen må ha minst 1 bruker eller 1 rolle som mottakere")

    if (errors.length > 0) return errors.join("\n")
    return true
}

async function activateAnnouncement(announcement: Announcement, channel: TextChannel) {
    if (!announcement.legalEmojies) throw new Error("ILLEGAL STATE")
    // Post announcement to channel
    const embed = new EmbedBuilder()
    embed.setTitle(announcement.title)
    embed.setDescription(announcement.content)
    embed.addFields(
        {name: "Svarfrist(Før masing begynner)", value: renderDateMMDDhh(parseAnnouncementDeadline(announcement.deadline))},
        {name: "Svar da!", value: "For å svare på denne bruk en av emojiene under denne meldingen. Hvis du ikke svarer innen fristen vil du bli mast på helt til du svarer", inline: false}
    )
    embed.setFooter({text: "Denne kunngjøringen ble sendt ut av " + announcement.owner.displayName})
    embed.setColor("Random")

    const naggersResolved = announcement.nagWho(channel)
    const announcementMessage = await channel.send({
        embeds: [embed],
        content: naggersResolved.map(who => `<@${who}>`).join(" ")
    })

    const legalEmojis = legalEmojiSets.find(set => set.key === announcement.legalEmojies)
    if (!legalEmojis) throw new Error("No legal emoji set found from key...")
    for (let i = 0; i < legalEmojis.ids.length; i++) {
        const name = legalEmojis.names[i]
        const id = legalEmojis.ids[i]

        if (!id) {
            await announcementMessage.react(name)
        } else {
            await announcementMessage.react(`<:${name}:${id}>`)
        }
    }

    announcementMessage.pin()

    const id = Math.floor(Math.random() * 1000)
    // It's time, activate all announcement forces
    await createDatabaseAnnouncement(announcement, id, announcementMessage.id, naggersResolved)

    const deadline = parseAnnouncementDeadline(announcement.deadline)
    // If the deadline is in under 24h send the mail after 10 sec, if not the mail goes out after 24h
    const initialMailDeadline = deadline.getTime() - Date.now() <= DAY_IN_MILLISECONDS ? 10000 : DAY_IN_MILLISECONDS
    addNagJob("initiateNagging", {
        announcement: id,
        step: -2
    }, new Date(Date.now() + initialMailDeadline))

    addNagJob("initiateNagging", {
        announcement: id,
        step: -1
    }, deadline)

    await announcement.messageWebhook.editMessage("@original", {
        components: [],
        content: "Kunngjøring har blitt aktivert! Denne meldingen kan nå skjules",
        embeds: []
    })
    wipAnnouncements.delete(announcement.messageWebhook.id)
}

function parseAnnouncementDeadline(deadline: string) {
    const parts = needNotNullOrUndefined(deadline.match(/(\d+)(h)?/), "Parsing announcement deadline")
    const deadlineDate = new Date()
    const delay = Number(parts[1])
    const isHours = parts.at(2)
    if (isHours) {
        deadlineDate.setHours(deadlineDate.getHours() + delay)
    } else {
        deadlineDate.setDate(deadlineDate.getDate() + delay)
    }

    return deadlineDate
}

// TODO:
// On restart, need to read all current announcements and update responses before restarting nagging
// What happens if someone changes their reaction? Only allow changes and not take-backs?

function shouldIgnoreRole(tags: RoleTagData | null) {
    if (tags) {
        return (tags?.availableForPurchase ||
            tags?.botId ||
            tags?.integrationId ||
            tags?.premiumSubscriberRole ||
            tags?.subscriptionListingId) === true
    }
    return false
}

// Type predicate helpers

export function isValidNaggingKey(key: string): key is NaggingRulesKey {
    return Object.keys(naggingRules).includes(key)
}

export function isValidEmojiSetKey(key: string): key is LegalEmoijiesKey {
    return legalEmojiSets.some(set => set.key === key)
}

export async function handleAnnouncementReaction(announcementMessage: Snowflake, announcementChannel: Snowflake, emojiEvent: DiscordEmojiEvent, userID: Snowflake) {
    const channel = await discordClient.guild.channels.fetch(announcementChannel)
    if (!channel || channel.type !== 0) throw new Error("Can't find announcement channel")

    const message = await channel.messages.fetch(announcementMessage)
    const responseData = await needResponseData(announcementMessage)
    const legalEmojies = legalEmojiSets.find(set => set.key === responseData.legalEmojies)
    if (!legalEmojies) throw new Error("No legal emoji set found when handling reaction... " + responseData.legalEmojies)

    if (emojiEvent.type === "MESSAGE_REACTION_REMOVE_ALL") {
        await addNonRespondant(announcementMessage, userID)
    } else {
        let added: MessageReaction | undefined
        let removed: MessageReaction | undefined
        let existing: MessageReaction | undefined
        for await (const reaction0 of message.reactions.cache) {
            const reaction = reaction0[1]
            // Some user tried to react with invalid emoji
            if (!(legalEmojies.names as readonly string[]).includes(reaction.emoji.name!)) {
                reaction.remove()
                continue
            }

            const users = await reaction.users.fetch()
                // User has another reaction than the event is about
                if (users.has(userID) && reaction.emoji.name !== emojiEvent.name) {
                    existing = reaction
                }
                // User added this reaction
                if (users.has(userID) && reaction.emoji.name === emojiEvent.name) {
                    added = reaction
                }
                // User removed this reaction
                if (!users.has(userID) && reaction.emoji.name === emojiEvent.name) {
                    removed = reaction
                }
        }

        // If manually removed we can always assume the user shall transition to a "non-respondant"
        if (removed) {
            // If we remove the users other reaction on a switch it fires an event, so we ignore that remove
            if (existing) return

            // User just removed their answer >:(
            console.log("User removed an answer")
            addNonRespondant(announcementMessage, userID)
            return
        }

        // If a reaction is added, we have to check if it is a switch or just an answer
        if (added) {
            if (existing) {
                console.log("User switched their answer")
                // User has at an earlier point reacted another reaction and now they change
                existing.users.remove(userID)
            } else {
                console.log("User added their answer")
                removeNonRespondant(announcementMessage, userID)
            }
            return
        }
    }
}

function customID(type: string, name: string, announcementWebhookID?: Snowflake) {
    return `announcement-${type}-${name}-` + (announcementWebhookID && announcementWebhookID !== "" ? announcementWebhookID : "")
}

