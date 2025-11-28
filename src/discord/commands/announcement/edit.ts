import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle,
    ChatInputCommandInteraction, ContainerBuilder, EmbedBuilder, LabelBuilder, MessageFlagsBitField,
    ModalBuilder, ModalSubmitInteraction,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle, ComponentType, Snowflake
} from "discord.js"
import {deleteNagJobs, getAllJobs, NagInitiationJobData} from "../../../util/announcementNaggingMessageQueue.js"
import {
    AnnouncementContentData, editAnnouncement,
    needAllAnnouncementContents,
    needAnnouncementContent,
    needNaggingData, deleteAnnouncement, needAnnouncementData
} from "../../../database/discord.js"
import {discordClient, postUrgentDebug} from "../../client.js"
import {ConsoleLogger, Logger} from "../../../util/logging.js"

export const data = new SlashCommandBuilder()
    .setName("kunngjøring-admin")
    .setDescription("Endre eller slett aktive kunngjøringer")

export async function execute(interaction: ChatInputCommandInteraction) {
    const jobs = await getAllJobs()

    if (jobs.length === 0) {
        const jobs = await getAllJobs()
        await interaction.reply({
            content: "Det er for øyeblikket ingen aktive annonseringer å administrere :)\nVentende jobber: " +
                (jobs.length > 0 ? jobs.map(j => `${j.name}/${j.id}/${j.data}`).join("\n") : "Ingen for øyeblikket"),
            flags: [MessageFlagsBitField.Flags.Ephemeral]
        })
        return
    }

    const jobPicker = new StringSelectMenuBuilder({
        customId: "announcementEdit-picker",
        placeholder: "Trykk her for å se en liste over aktive kunngjøringer"
    })

    const contentDatas = await needAllAnnouncementContents()
    const foundAnnouncements: number[] = []

    jobPicker.addOptions(jobs.filter(j => j.name === "initiateNagging")
        .map(job => {
            const data = job.data as NagInitiationJobData
            const contentData = contentDatas.find(c => c.id === data.announcement && !foundAnnouncements.includes(data.announcement))!
            if (!contentData) return undefined
            foundAnnouncements.push(data.announcement)
            return new StringSelectMenuOptionBuilder({
                label: contentData.title,
                value: String(data.announcement)
            })
        }) // TODO too many passes?
        .filter(j => j !== undefined)
    )

    await interaction.reply({
        content: "Velg en kunngjøring å administrere",
        components: [new ActionRowBuilder<StringSelectMenuBuilder>({components: [jobPicker]})],
        flags: [MessageFlagsBitField.Flags.Ephemeral]
    })
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
            await interaction.showModal(createContentModal(announcement.id, announcement.title, announcement.content))
            interaction.webhook.deleteMessage(interaction.message)
            break
        }
        case "confirm": {
            const fields = interaction.message.embeds[0].fields
            const title = fields[0].value
            const content = fields[1].value
            await editAnnouncement({id: announcement.id, title: title, content: content})

            const data = await needNaggingData(announcement.id)

            const currentAnnouncement = await interaction.channel!.messages.fetch(data.announcementMessageID)
            const newEmbed = new EmbedBuilder(currentAnnouncement.embeds[0].data)
            newEmbed.setTitle(title)
            newEmbed.setDescription(content)
            await interaction.channel!.messages.edit(data.announcementMessageID, {
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

function createContentModal(announcementID: number, existingTitle: string, existingContent: string) {
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

/**
 * Stop an announcement! Can be called for early stops or when fully completed
 *
 * Deletes remaining queued jobs and data from the database, and sends a notice to the announcement OP with the stats for the announcement at
 * the time of stopping.
 * @param announcementID
 * @param deleteMessage if this is trur the original Discord message will be deleted from the channel it was posted. If it is false it will be kept, but
 * the bot will not prevent any users from deleting it.
 * @param reason why is the announcement stopped? The reason is preceded with "fordi"
 * @param logger
 */
export async function stopAnnouncement(announcementID: number, deleteMessage: boolean, reason: string, logger: Logger) {
    // If not, time to deactivate!
    // To preserve the state of the announcement with reactions at the time it is marked as completed, we send a message to the announcement OP
    // We don't preserve any announcement history, so the logged info + the message sent to announcement OP is the only "archive"

    const announcement = await needAnnouncementData(announcementID)
    const channel = await discordClient.guild.channels.fetch(announcement.announcementChannelID)
    if (!channel || !channel.isTextBased()) throw Error("Cant find announcement message when trying to close announcement")
    const message = await channel.messages.fetch(announcement.announcementMessageID)
    // Map users to each reaction name
    const reactionsMapped: Map<string, Snowflake[]> = new Map()
    for (const reaction0 of message.reactions.cache) {
        const reaction = reaction0[1]
        const users = (await reaction.users.fetch()).filter(user => !user.bot).map(user => user.displayName)
        if (!reaction.emoji.name) {
            throw new Error("Emoji has no name??")
        }

        if (users.length === 0) users.push("Ingen har reagert med denne")

        reactionsMapped.set(reaction.emoji.name, users)
    }
    const reactionsMappedText = Array.from(reactionsMapped).map(entry => `${entry[0]}:\n${entry[1].join(", ")}`).join("\n")

    await logger.logLine(`Announcement with title ${announcement.title} is now complete.`)
    await logger.logLine("At the time of completion the announcement had the following reactions:")
    await logger.logLine(reactionsMappedText)

    if (deleteMessage) {
        logger.logLine("Deleting original message of announcement")
        const channel = discordClient.guild.channels.resolve(announcement.announcementChannelID)
        if (!channel || !channel.isTextBased()) {
            logger.logWarning(`Could not find channel of original announcement message! ${channel && !channel?.isTextBased() ? "Is non-text type " + channel.type + ". " : ""} Ignoring delete request`)
        } else channel.messages.delete(announcement.announcementMessageID)

    }

    const report = new ContainerBuilder({
        components: [
            {
                content: "En kunngjøring som du lagde har blitt stoppet! \nÅrsaken er fordi: " + reason,
                type: ComponentType.TextDisplay
            },
            {
                type: ComponentType.Separator
            },
            {
                content: reactionsMappedText,
                type: ComponentType.TextDisplay
            },
        ]
    })
    const announcementOP = discordClient.guild.members.resolve(announcement.originalNagger)
    if (announcementOP) {
        await announcementOP.send({
            components: [
                report
            ],
            flags: MessageFlagsBitField.Flags.IsComponentsV2
        })
    } else {
        await postUrgentDebug("Ooops could not find original announcement owner? ID: " + announcement.originalNagger + ". Announcement stop report will follow")
        await postUrgentDebug("Reason " + reason + ". Reactions: " + reactionsMappedText)
    }

    // To be safe we flush the job queue for related jobs
    deleteNagJobs(announcement.id)
    await deleteAnnouncement(announcement.id)
}
