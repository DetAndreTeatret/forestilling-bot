import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType,
    EmbedBuilder, GuildChannel, LabelBuilder, MessageFlagsBitField,
    MessageReaction,
    ModalBuilder, ModalSubmitInteraction, Role, RoleSelectMenuBuilder, RoleTagData,
    Snowflake, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle, UserSelectMenuBuilder
} from "discord.js"
import {renderDateMMDDhh} from "../util/date.js"
import {needNotNullOrUndefined} from "../util/util.js"
import {discordClient, DiscordEmojiEvent} from "../discord/client.js"
import {
    activateAnnouncement,
    Announcement,
    canActivateAnnouncement,
    isValidEmojiSetKey,
    legalEmojiSets,
    parseAnnouncementDeadline, stopAnnouncement
} from "./announcement.js"
import {
    addNonRespondant, AnnouncementContentData, editAnnouncement, needAnnouncementContent, needNaggingData,
    needResponseData, removeNonRespondant,
    switchResponse
} from "../database/announcement.js"
import {getAllJobs, jobToString} from "./messageQueue.js"
import {ConsoleLogger} from "../util/logging.js"

/*
 * Most announcement logic regarding creation of embeds and handling interaction events in Discord.
 * Also see announcement.ts in same dir
 */


const wipAnnouncements: Map<string, Announcement> = new Map()

export function createContentModal(announcementWebhookID?: string, existingTitle?: string, existingContent?: string, existingDeadline?: string) {
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
                new ActionRowBuilder<StringSelectMenuBuilder>({components: [legalEmojiesPicker]}),
                new ActionRowBuilder<ButtonBuilder>({components: [changeContentButton, cancelButton, confirmButton]})
            ],
            flags: MessageFlagsBitField.Flags.Ephemeral
        })

        const member = await channel.guild.members.fetch(interaction.user)
        wipAnnouncements.set(interaction.webhook.id, new Announcement(member, channel, title, text, deadline, interaction.webhook))
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
            wipAnnouncements.delete(announcement.messageWebhook.id)
            await interaction.webhook.editMessage("@original", "Kunngjøring har blitt aktivert! Denne meldingen kan nå skjules")
            break
        }
        default:
            throw new Error("Received invalid announcement work button " + path)
    }
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
                switchResponse(announcementMessage, {respondant: userID, lastResponseTime: Date.now(), lastResponseEmoji: added.emoji.id ?? added.emoji.name ?? "Unknown Emoji"})
            } else {
                console.log("User added their answer")
                removeNonRespondant(announcementMessage, userID, {respondant: userID, lastResponseTime: Date.now(), lastResponseEmoji: added.emoji.id ?? added.emoji.name ?? "Unknown Emoji"})
            }
            return
        }
    }
}

// Unfortunately we can not add reactions "for" users, this means that if a user removes their old reaction it will stay removed.
// But, we will deny new reactions.
export async function revertOldAnnouncementReaction(announcementMessage: Snowflake, announcementChannel: Snowflake, userSnowflake: Snowflake) {
    const channel = await discordClient.guild.channels.fetch(announcementChannel)
    if (!channel || channel.type !== 0) throw new Error("Can't find announcement channel")

    const message = await channel.messages.fetch(announcementMessage)

    const responseData = await needResponseData(announcementMessage)
    const data = responseData.respondantData.find(d => d.respondant === announcementMessage)
    if (!data) {
        for (const reaction of message.reactions.cache) {
            reaction[1].users.remove(userSnowflake)
        }
    } else {
        for (const reaction of message.reactions.cache) {
            if (reaction[1].emoji.name ?? reaction[1].emoji.id !== data.lastResponseEmoji) {
                reaction[1].users.remove(userSnowflake)
            }
        }
    }

    // Friendly warning...
    await channel.client.users.send(userSnowflake, "Oops! Du prøvde å endre svaret ditt på en kunngjøring som allerede er lukket, hvis du vil endre svar nå anbefales det å sende en direkte melding til personen som lagde kunngjøringen")
}

export async function handleAnnouncementEditRequest(interaction: AnySelectMenuInteraction) {
    const contentData = await needAnnouncementContent(interaction.values[0])
    const message = createAnnouncementEditMessage(contentData)

    await interaction.reply({
        embeds: [message.embed],
        components: [new ActionRowBuilder<ButtonBuilder>({components: message.components})],
        flags: [MessageFlagsBitField.Flags.Ephemeral]
    })

    interaction.webhook.deleteMessage(interaction.message)
}

function createAnnouncementEditMessage(contentData: AnnouncementContentData) {
    const deleteButton = new ButtonBuilder({
        style: ButtonStyle.Danger,
        label: "Slett aktiv kunngjøring",
        customId: "announcementEdit-button-delete-" + contentData.id
    })
    const deactivateButton = new ButtonBuilder({
        style: ButtonStyle.Danger,
        label: "Stopp all masing om kunngjøring", // TODO stopp -> fullfør kunngjøring som den er
        customId: "announcementEdit-button-deactivate-" + contentData.id
    })
    const editButton = new ButtonBuilder({
        style: ButtonStyle.Primary,
        label: "Endre tittel eller innhold",
        customId: "announcementEdit-button-edit-" + contentData.id
    })
    const confirmEdits = new ButtonBuilder({
        style: ButtonStyle.Success,
        label: "Bekreft endringer",
        customId: "announcementEdit-button-confirm-" + contentData.id
    })

    const embed = new EmbedBuilder({
        title: "Arbeid med aktiv kunngjøring",
        description: "Her kan du endre, deaktivere eller slette den valgte aktive kunngjøringen",
        fields: [
            {name: "Foreløpig tittel", value: contentData.title, inline: false},
            {name: "Foreløpig innhold", value: contentData.content, inline: false}
        ]
    })

    return {embed: embed, components: [editButton, confirmEdits, deactivateButton, deleteButton]}
}

export async function handleAnnouncementEditButton(interaction: ButtonInteraction) {
    const path = interaction.customId.split("-")

    switch (path[2]) {
        case "jobsdebug": {
            const jobs = await getAllJobs("completed")

            const jobsStringified = (await Promise.all(jobs.map(j => jobToString(j)))).join("\n")

            await interaction.reply({
                content: jobsStringified,
                flags: [MessageFlagsBitField.Flags.Ephemeral],
            })

            return
        }
        case "flushFailed": {
            const reply = await interaction.deferReply({flags: [MessageFlagsBitField.Flags.Ephemeral]})
            const jobs = await getAllJobs()
            for await (const job of jobs) {
                if (await job.isFailed()){
                    await job.remove()
                }
            }

            await reply.edit("Jobs successfully removed!")
            return
        }
        case "flushALL": {
            const reply = await interaction.deferReply({flags: [MessageFlagsBitField.Flags.Ephemeral]})
            const jobs = await getAllJobs()
            for await (const job of jobs) {
                await job.remove()
            }

            await reply.edit("ALL jobs successfully removed!")
            return
        }
    }

    const announcement = await needAnnouncementContent(path[3])
    switch (path[2]) {
        case "delete": {
            const confirmButton = new ButtonBuilder({
                style: ButtonStyle.Danger,
                label: "Slett kunngjøring(Ingen angring)",
                customId: "announcementEdit-button-stop-" + announcement.id + "-nuke"
            })

            await interaction.reply({
                content: "Er du helt sikker på at du vil slette og stoppe denne aktive kunngjøringen? Det finnes ingen angreknapp, og den orginale meldingen **vil bli slettet**",
                components: [new ActionRowBuilder<ButtonBuilder>({components: [confirmButton]})],
                flags: [MessageFlagsBitField.Flags.Ephemeral]
            })
            break
        }
        case "deactivate": {
            const confirmButton = new ButtonBuilder({
                style: ButtonStyle.Danger,
                label: "Slett kunngjøring(Ingen angring)",
                customId: "announcementEdit-button-stop-" + announcement.id + "-deactivate"
            })

            await interaction.reply({
                content: "Er du helt sikker på at du vil deaktivere denne aktive kunngjøringen(Stopper all masing)? Det finnes ingen angreknapp, den orginale meldingen blir **ikke** slettet",
                components: [new ActionRowBuilder<ButtonBuilder>({components: [confirmButton]})],
                flags: [MessageFlagsBitField.Flags.Ephemeral]
            })
            break
        }
        case "edit": {
            await interaction.showModal(createEditContentModal(announcement.id, announcement.title, announcement.content))
            interaction.webhook.deleteMessage(interaction.message)
            break
        }
        case "confirm": {
            const fields = interaction.message.embeds[0].fields
            const title = fields[0].value
            const content = fields[1].value
            await editAnnouncement({id: announcement.id, title: title, content: content})

            const data = await needNaggingData(announcement.id)

            const announcementChannel = await interaction.guild!.channels.fetch(data.announcementChannelID)
            if (!announcementChannel || announcementChannel.type !== ChannelType.GuildText) {
                throw new Error("Error fetching channel for announcement, trying to edit. " + data.announcementChannelID + " " + announcement.id)
            }

            const currentAnnouncement = await announcementChannel.messages.fetch(data.announcementMessageID)
            const newEmbed = new EmbedBuilder(currentAnnouncement.embeds[0].data)
            newEmbed.setTitle(title)
            newEmbed.setDescription(content)
            await currentAnnouncement.edit({
                embeds: [newEmbed],
            })

            await interaction.reply({
                content: "Endring av kunngjøring er bekreftet og gjennomført!",
                flags: [MessageFlagsBitField.Flags.Ephemeral],
            })

            interaction.webhook.deleteMessage(interaction.message)
            break
        }
        case "stop": {
            // nuke(stop and delete all) | deactivate (stop)
            const severity = path[4]

            const reason = interaction.user.displayName + (severity === "nuke" ? " slettet den" : " deaktiverte den")
            await stopAnnouncement(announcement.id, severity === "nuke", reason, new ConsoleLogger("[AnnouncementEdit]"))

            await interaction.reply({
                content: "Kunngjøring deaktivert" + (severity === "nuke" ? " og orginal melding slettet!" : ""),
                flags: [MessageFlagsBitField.Flags.Ephemeral],
            })

            await interaction.webhook.deleteMessage(interaction.message)
            break
        }
    }
}

function createEditContentModal(announcementID: number, existingTitle: string, existingContent: string) {
    const modalBuilder = new ModalBuilder()
    modalBuilder.setCustomId("announcementEdit-modal-" + announcementID)
    modalBuilder.setTitle("Endre kunngjøring")

    const title = new TextInputBuilder({
        customId: "announcementEdit-modal-title",
        required: true,
        style: TextInputStyle.Short,
        value: existingTitle
    })

    const content = new TextInputBuilder({
        customId: "announcementEdit-modal-content",
        required: true,
        style: TextInputStyle.Paragraph,
        value: existingContent
    })

    modalBuilder.addLabelComponents(
        new LabelBuilder().setLabel("Tittel").setTextInputComponent(title),
        new LabelBuilder().setLabel("Innhold").setTextInputComponent(content),
    )

    return modalBuilder
}

export async function handleAnnouncementEditSubmit(interaction: ModalSubmitInteraction) {
    const message = createAnnouncementEditMessage({
        id: Number(interaction.customId.split("-")[2]),
        title: interaction.fields.getTextInputValue("announcementEdit-modal-title"),
        content: interaction.fields.getTextInputValue("announcementEdit-modal-content"),
    })

    await interaction.reply({
        embeds: [message.embed],
        components: [new ActionRowBuilder<ButtonBuilder>({components: message.components})],
        flags: MessageFlagsBitField.Flags.Ephemeral
    })
}

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

function customID(type: string, name: string, announcementWebhookID?: Snowflake) {
    return `announcement-${type}-${name}-` + (announcementWebhookID && announcementWebhookID !== "" ? announcementWebhookID : "")
}
