import {StringConsumer} from "../discord/daemon.js"

export class Logger {
    constructor(listener: StringConsumer) {
        this.listener = listener
    }

    private currentLog: string[] = []

    private lastPartInline: string | undefined = undefined

    private readonly listener: StringConsumer

    async logLine(line: string) {
        this.currentLog.push("\n" + line)
        this.lastPartInline = undefined
        await this.renderToListener()
    }

    /**
     * If the last log was also inline this newpart will replace it
     */
    async logPart(newPart: string) {
        newPart = "\n" + newPart
        const lengthMinusOne = this.currentLog.length - 1
        if(this.lastPartInline) {
            this.currentLog[lengthMinusOne] = newPart
            this.lastPartInline = newPart
        } else {
            this.currentLog.push(newPart)
            this.lastPartInline = newPart
        }
        await this.renderToListener()
    }

    async logWarning(newPart: string) {
        await this.logLine(newPart) // TODO
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

        await this.listener(string)
    }
}
