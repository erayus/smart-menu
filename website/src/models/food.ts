
export type IFood = {
    id: number,
    name: string,
    category: FoodCategory,
    imgUrl: string,
    ingredients: string[]
}

//TODO: use if necessary
export type IIngredient = {
    name: string,
    quantityUnit: string //TODO: may split into two properties if necessary
}

export enum FoodCategory {
    Main = 'Main',
    Soup = 'Soup',
    Dessert = 'Desert'
}

