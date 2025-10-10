import {
    ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle,
    ChatInputCommandInteraction, EmbedBuilder, MessageFlagsBitField,
    ModalBuilder, ModalSubmitInteraction,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js"
import {deleteNagJobs, getAllJobs, NagInitiationJobData} from "../../../util/announcementNaggingMessageQueue.js"
import {
    AnnouncementContentData, editAnnouncement,
    needAllAnnouncementContents,
    needAnnouncementContent,
    needNaggingData
} from "../../../database/discord.js"

export const data = new SlashCommandBuilder()
    .setName("kunngjøring-admin")
    .setDescription("Endre eller slett aktive kunngjøringer")

export async function execute(interaction: ChatInputCommandInteraction) {
    const jobs = await getAllJobs()

    if (jobs.length === 0) {
        await interaction.reply({content: "Det er for øyeblikket ingen aktive annonseringer å administrere :)", flags: [MessageFlagsBitField.Flags.Ephemeral]})
        return
    }

    const jobPicker = new StringSelectMenuBuilder({
        customId: "announcementEdit-picker",
        minValues: 1,
        maxValues: 1,
        placeholder: "Velg en masestrategi"
    })

    const contentDatas = await needAllAnnouncementContents()
    const foundAnnouncements: number[] = []

    jobPicker.addOptions(jobs.filter(j => j.name === "initiateNagging").map(job => {
        const data = job.data as NagInitiationJobData
        const contentData = contentDatas.find(c => c.id === data.announcement && !foundAnnouncements.includes(data.announcement))!
        foundAnnouncements.push(data.announcement)

        return new StringSelectMenuOptionBuilder({
            label: contentData.title,
            value: String(data.announcement)
        })
    }))

    await interaction.reply({
        content: "Velg en kunngjøring å administrere",
        components: [new ActionRowBuilder<StringSelectMenuBuilder>({components: [jobPicker]})]
    })
}


export async function handleAnnouncementEditRequest(interaction: AnySelectMenuInteraction) {
    const contentData = await needAnnouncementContent(interaction.values[0])
    const message = createAnnouncementEditMessage(contentData)

    await interaction.reply({
        embeds: [message.embed],
        components: [new ActionRowBuilder<ButtonBuilder>({components: message.components})],
    })
}

function createAnnouncementEditMessage(contentData: AnnouncementContentData) {
    const deleteButton = new ButtonBuilder({
        style: ButtonStyle.Danger,
        label: "Slett aktiv kunngjøring",
        customId: "announcementEdit-button-delete-" + contentData.id
    })
    const deactivateButton = new ButtonBuilder({
        style: ButtonStyle.Danger,
        label: "Stopp all masing om kunngjøring",
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
                components: [new ActionRowBuilder<ButtonBuilder>({components: [confirmButton]})]
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
                components: [new ActionRowBuilder<ButtonBuilder>({components: [confirmButton]})]
            })
            break
        }
        case "edit": {
            await interaction.showModal(createContentModal(announcement.id, announcement.title, announcement.content))
            await interaction.webhook.deleteMessage("@original")
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
            newEmbed.setTitle(announcement.title)
            // Replace the current content field with a new one, can't edit active field.
            newEmbed.spliceFields(1, 2)
            newEmbed.addFields({name: "Kunngjøring", value: content, inline: false})
            await interaction.channel!.messages.edit(data.announcementMessageID, {
                embeds: [newEmbed],
            })

            await interaction.reply("Endring av kunngjøring er bekreftet og gjennomført!")
            break
        }
        case "stop": {
            const severity = path[4]
            if (severity === "nuke") {
                const data = await needNaggingData(announcement.id)
                interaction.channel!.messages.delete(data.announcementMessageID)
            }

            deleteNagJobs(announcement.id)

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
        label: "Tittel",
        required: true,
        style: TextInputStyle.Short,
        value: existingTitle
    })

    const content = new TextInputBuilder({
        customId: "announcementEdit-modal-content",
        label: "Innhold",
        required: true,
        style: TextInputStyle.Paragraph,
        value: existingContent
    })

    modalBuilder.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(title),
        new ActionRowBuilder<TextInputBuilder>().addComponents(content),
    )

    return modalBuilder
}

export async function handleAnnouncementEditSubmit(interaction: ModalSubmitInteraction) {
    const message = createAnnouncementEditMessage({
        id: Number(interaction.customId.split("-")[2]),
        title: interaction.fields.getTextInputValue("announcementEdit-modal-title"),
        content: interaction.fields.getTextInputValue("announcementEdit-modal-content")
    })

    await interaction.reply({
        embeds: [message.embed],
        components: [new ActionRowBuilder<ButtonBuilder>({components: message.components})]
    })
}
