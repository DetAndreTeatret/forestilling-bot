import {ChatInputCommandInteraction, InteractionResponse, SlashCommandBuilder} from "discord.js";
import {page} from "../../main.js"
import {DiscordCommandError, SuperClient} from "../discord.js";
import {DateRange, tomorrow} from "../../common/date.js";
import {queChannelDeletion} from "../../database/discord.js";
import {getEventIds} from "../../scraper/pages/schedule.js";
import {scrapeEvents} from "../../scraper/pages/eventAssignement.js";
import {startDaemon} from "../daemon.js";


export const data = new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update show channels in Discord(delete/create/update")

export async function execute(interaction: ChatInputCommandInteraction) {
        const initialMessage = "Fetching SchedgeUp Events..."
        const updateMessage = editMessage.bind([initialMessage, await interaction.reply(initialMessage)])

        //Its important that this only includes events for the current week!
        //Any running channels belonging to events not fetched here will be deleted after some time
        const events = await scrapeEvents(page, await getEventIds(page, new DateRange(new Date(), new Date("2023-08-01")))) //TODO: Fetch for current week only!
        const client = interaction.client as SuperClient
        if(interaction.guild == null) throw new DiscordCommandError("Guild is null", "update")
        await updateMessage("Mapping currently running Discord channels...")
        const channels = await client.mapRunningChannels(interaction.guild)

        await updateMessage("Checking if any running channels are old...")
        channels.forEach((channel, id) => {
                if(!events.find(e => e.id == id)) {
                        queChannelDeletion(channel, tomorrow())
                }
        })

        await updateMessage("Checking if any events this week has members to remove/add...")
        channels.forEach(await async function (channel, id)  {
                const event = events.find(e => e.id == id)
                if(event == undefined) return
                await (interaction.client as SuperClient).updateMembersForChannel(channel, event)
        })

        //TODO: Send requests to create channels
        await updateMessage("Checking if any events this week needs to be posted...")
        for await (const event of events) {
                if(!channels.find((channel, id) => id == event.id)) {
                        console.log("Creating discord channel for event " + event.title)
                        await (interaction.client as SuperClient).createNewChannelForEvent(interaction.guild, event)
                }
        }

        await updateMessage("Update is done!")

        startDaemon() //Only start daemon after first update to ensure local channelCache is updated
}

async function editMessage(this:[string, InteractionResponse], newPart: string) {
        this[0] = this[0] + "\n" + newPart
        await this[1].edit(this[0])
}

