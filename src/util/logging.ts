import {ButtonInteraction, ChatInputCommandInteraction, InteractionResponse} from "discord.js"

export interface Logger {
    /**
     * Logs on a new line
     */
    logLine(part: string): Promise<void>

    /**
     * Logging multiple parts will overwrite older parts on same line if logger supports it
     */
    logPart(part: string): Promise<void>

    /**
     * Logs on a new line, menacingly
     */
    logWarning(part: string): Promise<void>
}

export class DelegatingLogger implements Logger {

    private readonly delegatees: Logger[]

    constructor(delegatees: Logger[]) {
        this.delegatees = delegatees
    }

    async logLine(part: string) {
        this.delegatees.forEach(l => l.logLine(part))
    }
    async logPart(part: string) {
        this.delegatees.forEach(l => l.logPart(part))
    }
    async logWarning(part: string) {
        this.delegatees.forEach(l => l.logWarning(part))
    }

}

export class DiscordMessageReplyLogger implements Logger {

    private currentLog: string[] = []
    private lastPartInline: string | undefined = undefined

    private message: Promise<InteractionResponse>

    constructor(interaction: ChatInputCommandInteraction | ButtonInteraction) {
        this.message = interaction.reply("Ikke tenk på denne meldingen!")
    }

    async logLine(part: string) {
        this.currentLog.push("\n" + part)
        this.lastPartInline = undefined
        await this.renderToListener()
    }

    async logPart(part: string) {
        part = "\n" + part
        const lengthMinusOne = this.currentLog.length - 1
        if (this.lastPartInline) {
            this.currentLog[lengthMinusOne] = part
            this.lastPartInline = part
        } else {
            this.currentLog.push(part)
            this.lastPartInline = part
        }
        await this.renderToListener()
    }

    async logWarning(part: string) {
        await this.logLine(":warning:WARNING:warning: " + part)
    }

    render() {
        let result = this.currentLog[0]

        for (let i = 1; i < this.currentLog.length; i++) {
            result += this.currentLog[i]
        }

        return result
    }

    async renderToListener() {
        const string = this.render()

        await this.message.then(m => m.edit(string))
    }
}

export class ConsoleLogger implements Logger {

    prefix: string

    /**
     * Prefix prepended to all logged message(one space is put between prefix and message)
     */
    constructor(prefix: string) {
        this.prefix = prefix
    }

    async logLine(part: string): Promise<void> {
        console.log(this.prefix + " " + part)
    }

    async logPart(part: string): Promise<void> {
        console.log(this.prefix + " " + part)
    }

    async logWarning(part: string): Promise<void> {
        console.warn(this.prefix + " " + part)
    }

}

/**
 * A logger which does nothing with logs
 */
export class DummyLogger implements Logger {

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    logLine(part: string): Promise<void> {
        return Promise.resolve(undefined)
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    logPart(part: string): Promise<void> {
        return Promise.resolve(undefined)
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    logWarning(part: string): Promise<void> {
        return Promise.resolve(undefined)
    }

}
