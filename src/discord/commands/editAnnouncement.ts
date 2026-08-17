import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChatInputCommandInteraction, MessageFlagsBitField,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js"
import {
    getAllJobs,
    NagInitiationJobData
} from "../../announcement/messageQueue.js"
import {inspect} from "util"
import {needAllAnnouncementContents} from "../../database/announcement.js"

export const data = new SlashCommandBuilder()
    .setName("kunngjøring-admin")
    .setDescription("Endre eller slett aktive kunngjøringer")

export async function execute(interaction: ChatInputCommandInteraction) {
    const jobs = await getAllJobs("completed")
    const contentDatas = await needAllAnnouncementContents()

    if (contentDatas.length === 0) {
        const flushJobsButton = new ButtonBuilder({
            customId: "announcementEdit-button-flushALL",
            label: "Fjern ALLE jobber(farlig)",
            style: ButtonStyle.Danger,
        })
        const jobsString = jobs.map(async j => `${j.name}/${j.id}/${await j.getState()}/${inspect(j.data)}`)

        await interaction.reply({
            content: "Det er for øyeblikket ingen aktive annonseringer å administrere :)\nVentende jobber: \n>>> " + (jobsString.length > 0 ? jobsString.join("\n>>> ") : "Ingen for øyeblikket"),
            flags: [MessageFlagsBitField.Flags.Ephemeral],
            components: jobs.length > 0 ? [new ActionRowBuilder<ButtonBuilder>({components: [flushJobsButton]})] : undefined
        })
        return
    }

    const jobPicker = new StringSelectMenuBuilder({
        customId: "announcementEdit-picker",
        placeholder: "Trykk her for å se en liste over aktive kunngjøringer"
    })

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
        })
        .filter(j => j !== undefined)
    )

    const jobDebugButton = new ButtonBuilder({
        customId: "announcementEdit-button-jobsdebug",
        label: "Se ventende jobber",
        style: ButtonStyle.Primary,
    })

    const flushFailedJobsDebugButton = new ButtonBuilder({
        customId: "announcementEdit-button-flushFailed",
        label: "Fjern feilede jobber",
        style: ButtonStyle.Danger,
    })

    await interaction.reply({
        content: "Velg en kunngjøring å administrere",
        components: [new ActionRowBuilder<StringSelectMenuBuilder>({components: [jobPicker]}), new ActionRowBuilder<ButtonBuilder>({components: [jobDebugButton, flushFailedJobsDebugButton]})],
        flags: [MessageFlagsBitField.Flags.Ephemeral]
    })
}
