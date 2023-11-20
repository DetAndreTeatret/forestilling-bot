import {SimpleDate} from "../common/date.js"
import http from "http"

const FORMAT = "https://docs.google.com/forms/d/e/1FAIpQLSdumsKM0oAOeM2kRzjDLbC28BDQvQitERBMsSsCQCxRRLCVlQ/formResponse?&submit=Submit?usp=pp_url&entry.461723780=%name%&entry.1829257856=%allergi%&entry.2032323668=%matValg%&entry.554086150=%dato%&entry.1753729631=%rolle%"

export enum FoodChoice {
    A = "A: Nr 1. Thai Grønn Karri KYLLING",
    B = "B: Nr 1. Thai Grønn Karri VEGETAR",
    C = "C: Nr 2. Pad Thai KYLLING",
    D = "D: Nr 2. Pad Thai BIFF",
    E = "E: Nr 3. Thai vårrull",
    F = "F: Nr 4. Vegetar tofu wok"
}

export const foodChoiceValues = [FoodChoice.A, FoodChoice.B, FoodChoice.C, FoodChoice.D, FoodChoice.E, FoodChoice.F]

export enum Role {
    SKUESPILLER = "Skuespiller",
    TEKNIKER = "Tekniker",
    FRIVILLIG = "Frivillig",
    BAR = "Bar"
}

export type Allergy = string | "Jeg har ingen allergier e.l."

class FoodOrder {
    private readonly _who: string
    private readonly _when: SimpleDate
    private readonly _food: FoodChoice
    private readonly _role: Role
    private readonly _allergy: Allergy

    constructor(who: string, when: SimpleDate, food: FoodChoice, role: Role, allergy: Allergy) {
        this._who = who
        this._when = when
        this._food = food
        this._role = role
        this._allergy = allergy
    }

    get who(): string {
        return this._who
    }

    get when(): SimpleDate {
        return this._when
    }

    get food(): FoodChoice {
        return this._food
    }

    get role(): Role {
        return this._role
    }

    get allergy(): Allergy {
        return this._allergy
    }

    toString() {
        return "who:" + this.who + ",when:" + this.when.toString() + ",food:" + this.food + ",role:" + this.role + ",allergy:" + this.allergy
    }
}

export async function orderFood(who: string, date: SimpleDate, foodChoice: FoodChoice, role: Role, allergies: Allergy) {
    const order = new FoodOrder(who, date, foodChoice, role, allergies)
    const url = createFormString(order)

    console.log("Order food: " + url)

    // http.request(url, () => {
    //   console.log("Sucessfully sent food order " + order.toString())
    // })
}

export async function updateOrder(who: string, date: Date, newFoodChoice?: FoodChoice, adjustedAllergy?: Allergy) {
    if(newFoodChoice === undefined && adjustedAllergy === undefined) {
        throw new Error("Either a new food choice or an adjusted allergy has to be specified.(who:" + who + ",date:" + date)
    }

    console.log("Update order")
}

export async function checkCurrentOrder(who: string, when: SimpleDate) {
    // Check current order for given date
    return FoodChoice.B
    // null if nothing
    return null
}

function createFormString(order: FoodOrder) {
    return FORMAT
        .replace("%name%", encodeURI(order.who))
        .replace("%allergi%", encodeURI(order.allergy))
        .replace("%matValg%", encodeURI(order.food))
        .replace("%dato%", order.when.renderStringYYYYMMDD()) // format
        .replace("%rolle%", order.role)
}
