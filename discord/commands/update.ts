import {ChatInputCommandInteraction, Guild, InteractionResponse, SlashCommandBuilder} from "discord.js";
import {page} from "../../main.js"
import {DiscordCommandError, SuperClient} from "../discord.js";
import {DateRange, tomorrow} from "../../common/date.js";
import {queChannelDeletion} from "../../database/discord.js";
import {getEventIds} from "../../scraper/pages/schedule.js";
import {scrapeEvents} from "../../scraper/pages/eventAssignement.js";
import {addGuildToUpdate, startDaemon} from "../daemon.js";


export const data = new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update show channels in Discord(delete/create/update")

export async function execute(interaction: ChatInputCommandInteraction) {
        const initialMessage = "Starting update!"
        const updateMessage = editMessage.bind([initialMessage, await interaction.reply(initialMessage)])
        if(interaction.guild == null) {
                throw new DiscordCommandError("Guild is null", "update/#execute")
        }
        await update(interaction.guild, updateMessage)
        addGuildToUpdate(interaction.guild)
        startDaemon() //Only start daemon after first update to ensure local channelCache is updated
}

/**
 * Look for changes in SchedgeUp
 */
export async function update(guild: Guild | null, logger: (newPart: string) => Promise<void>) {
        await logger("Fetching SchedgeUp Events...")

        //Its important that this only includes events for the current week!
        //Any running channels belonging to events not fetched here will be deleted after some time
        const events = await scrapeEvents(page, await getEventIds(page, new DateRange(new Date(), new Date("2023-08-01")))) //TODO: Fetch for current week only!
        if(guild == null) throw new DiscordCommandError("Guild is null", "update")
        const client = guild.client as SuperClient
        await logger("Mapping currently running Discord channels...")
        const channels = await client.mapRunningChannels(guild)

        await logger("Checking if any running channels are old...")
        channels.forEach((channel, id) => {
                if(!events.find(e => e.id == id)) {
                        queChannelDeletion(channel, tomorrow())
                }
        })

        await logger("Checking if any events this week has members to remove/add...")
        channels.forEach(await async function (channel, id)  {
                const event = events.find(e => e.id == id)
                if(event == undefined) return
                await client.updateMembersForChannel(channel, event)
        })

        //TODO: Send requests to create channels
        await logger("Checking if any events this week needs to be posted...")
        for await (const event of events) {
                if(!channels.find((channel, id) => id == event.id)) {
                        console.log("Creating discord channel for event " + event.title)
                        await client.createNewChannelForEvent(guild, event)
                }
        }

        await logger("Update is done!")
}

async function editMessage(this: [string, InteractionResponse], newPart: string) {
        this[0] = this[0] + "\n" + newPart
        await this[1].edit(this[0])
}

