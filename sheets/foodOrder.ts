import {SimpleDate} from "../common/date";

type Allergy = string | "Jeg har ingen allergier e.l."

enum Role {
    SKUESPILLER = "Skuespiller",
    TEKNIKER = "Tekniker",
    FRIVILLIG = "Frivillig",
    BAREN = "Baren"
}

enum FoodChoice {
    NR_1 = "" //TODO
}

class FoodOrder {
    private readonly _who: string
    private readonly _when: Date
    private readonly _food: FoodChoice
    private readonly _role: Role
    private readonly _allergy: Allergy

    constructor(who: string, when: Date, food: FoodChoice, role: Role, allergy: Allergy) {
        this._who = who;
        this._when = when;
        this._food = food;
        this._role = role;
        this._allergy = allergy;
    }

    get who(): string {
        return this._who;
    }

    get when(): Date {
        return this._when;
    }

    get food(): FoodChoice {
        return this._food;
    }

    get role(): Role {
        return this._role;
    }

    get allergy(): Allergy {
        return this._allergy;
    }
}

export async function orderFood(who: string, date: Date, foodChoice: FoodChoice, allergies: Allergy, role: Role) {
    //Construct the form url to submit

    //Send the url
}

export async function updateOrder(who: string, date: Date, newFoodChoice?: FoodChoice, adjustedAllergy?: Allergy) {
    if(newFoodChoice === undefined && adjustedAllergy === undefined) {
        throw new Error("Either a new food choice or an adjusted allergy has to be specified.(who:" + who + ",date:" + date)
    }
}

export async function checkCurrentOrder(who: string, when: SimpleDate) {
    //Check current order for given date

    //null if nothing
}
