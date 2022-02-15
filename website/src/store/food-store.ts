import { IUserFoodCategoryQuantity } from './../models/food';
import { makeAutoObservable, toJS } from 'mobx';
import { IFood, IFoodCategory, IFoodIngredient } from '../models/food';
import { IIngredient, IIngredientCategory, IUnit } from '../models/ingredient';
import { ingredientTable } from '../utils/ingredientTable';
import axiosApi from '../utils/axios-api';
import UserStore from './user-store';
import { isTimeToRenewFood, getRenewDate } from '../utils/renewTime';
const clone = require('rfdc/default');

export type IFoodProjection = {
    id: string;
    name: string;
    category: IFoodCategory;
    imgUrl: string;
    ingredients: {
        id: string;
        category: IIngredientCategory;
        name: string;
        unit: IUnit;
        quantity: number;
    }[];
};

export type ToBuyIngredient = {
    id: string;
    name: string;
    category: IIngredientCategory;
    quantity: number;
    unit: IUnit;
    isChecked: boolean;
};
export default class FoodStore {
    private menu: IFood[] | null = null;
    private listOfCheckedIngredientIds: string[] = [];

    userStore: UserStore;
    allFood: IFood[] | null = null;
    allIngredients: IIngredient[] | null = null;
    availableFoodCategories: IUserFoodCategoryQuantity[] = [];
    newFoodToActionOnId: string = '';
    setNewFoodToActionOnId = (id: string) => {
        this.newFoodToActionOnId = id;
    };
    foodAvailableForUpdate: IFoodProjection[] = [];
    error: any;
    loadingFood: boolean = false;
    isFoodAvailableForChangeLoading = false;

    renewDate: string | null = null;
    private renewPeriod: number = 7; //TODO: let the user configure this value

    constructor(user: UserStore) {
        makeAutoObservable(this);
        this.userStore = user;
    }

    get menuProjection() {
        if (this.menu) {
            return [
                ...this.menu!.map((food) =>
                    this.convertFoodToFoodProjection(food)
                ),
            ];
        }
        return [];
    }

    get toBuyList(): ToBuyIngredient[] {
        let allIngredientsThisWeek: IFoodIngredient[] = [];
        this.menu?.forEach((food) => {
            allIngredientsThisWeek = [
                ...allIngredientsThisWeek.slice(),
                ...food.food_ingredients,
            ];
        });

        const aggregateIngredients: ToBuyIngredient[] =
            allIngredientsThisWeek.reduce(
                (accIngredients: ToBuyIngredient[], cur: IFoodIngredient) => {
                    //check if object is already in the acc array.
                    const curIng = this.getIngredientById(cur.id);

                    if (curIng === undefined) {
                        throw new Error(
                            `Can't find ingredient's details of ${cur.id}`
                        ); //TODO: log this
                    }

                    const index = accIngredients.findIndex(
                        (x) => x.name === curIng!.name
                    );
                    if (index === -1) {
                        const toBuyIngredient = {
                            id: cur.id,
                            name: curIng?.name || 'No name',
                            category: curIng?.category ?? '',
                            quantity: Math.round(cur.quantity * 10) / 10,
                            unit: curIng?.unit || null,
                            isChecked: this.listOfCheckedIngredientIds?.some(
                                (checkedIngId) => checkedIngId === curIng!.id
                            ),
                        };
                        accIngredients.push(toBuyIngredient);
                    } else {
                        accIngredients[index]['quantity'] +=
                            Math.round(cur.quantity * 10) / 10;
                    }

                    return accIngredients;
                },
                []
            );

        return aggregateIngredients;
    }

    private getRenewDate = (): string | null => {
        if (this.renewDate !== null) {
            return this.renewDate;
        }

        return this.userStore.getRenewDate();
    };

    private setRenewDate = (renewDate: Date) => {
        const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        };
        const todayDateFormat = renewDate.toLocaleDateString('en-AU', options);
        this.renewDate = todayDateFormat;
        this.userStore.saveRenewDate(todayDateFormat);
    };

    initializeFoodThisWeek = async () => {
        try {
            this.loadingFood = true;
            this.renewDate = this.getRenewDate();

            // if (this.allFood == null) { //TODO: check if the user has menu yet
            this.loadIngredients();
            // this.allFood = await this.retrieveAllFood();
            this.availableFoodCategories =
                this.userStore.getFoodCategoriesQuantities(); //TODO: query Dynamodb to get distinct value of Category column in the food table
            // }

            if (isTimeToRenewFood(new Date().toDateString(), this.renewDate)) {
                this.renewDate = getRenewDate(this.renewPeriod);
                this.loadNewMenu();
            } else {
                if (this.userStore.isMenuSaved()) {
                    this.loadExistingMenu();
                } else {
                    this.loadNewMenu();
                }
            }
            this.loadingFood = false;
        } catch (e: any) {
            this.loadingFood = false;
            this.error = e.message;
        }
    };

    private retrieveAllFood = async (): Promise<IFood[]> => {
        try {
            if (this.allFood) {
                return clone(this.allFood);
            }
            const result = await axiosApi.Food.list();
            this.allFood = result.data;
            return clone(this.allFood);
        } catch (e) {
            throw new Error('Failed to get food from the database.');
        }
    };

    private loadIngredients = async () => {
        this.allIngredients = ingredientTable;
    };

    private loadNewMenu = async () => {
        this.resetListOfCheckedIngredients();

        this.availableFoodCategories.forEach(async (foodCategory) => {
            const newFood = await this.getRandomFoodForCategory(
                foodCategory.category,
                foodCategory.quantity
            );
            this.updateFoodThisWeek(newFood, foodCategory.category);
        });
    };

    private resetListOfCheckedIngredients = () => {
        this.listOfCheckedIngredientIds = [];
        this.userStore.resetListOfCheckedIngredientIds();
    };

    updateFoodThisWeek = (newFood: IFood[], category: IFoodCategory) => {
        const foodThisWeekWithoutUpdatingFood =
            this.menu !== null
                ? this.menu!.filter(
                      (curFood) => curFood.food_category !== category
                  )
                : [];

        this.menu = [...foodThisWeekWithoutUpdatingFood, ...newFood];
        this.saveFoodThisWeek();
    };

    setLoadingFoodAvailableForUpdate = (state: boolean) => {
        this.isFoodAvailableForChangeLoading = state;
    };
    loadExistingMenu = () => {
        this.menu = this.userStore.getMenu();
    };

    //TODO: need rework after database implementing
    loadListOfCheckedIngredientIds = () => {
        this.listOfCheckedIngredientIds =
            this.userStore.getListOfCheckedIngredientIds();
    };

    //TODO
    clonedMenu = (): IFood[] => {
        return clone(this.menuProjection);
    };

    loadFoodAvailableForUpdate = async (
        targetFoodToChangeId?: string,
        targetFoodCategory?: IFoodCategory
    ): Promise<void> => {
        this.setLoadingFoodAvailableForUpdate(true);

        let allFood = await this.retrieveAllFood();
        let targetFood: IFood | null = null;
        if (targetFoodToChangeId) {
            targetFood = await this.getFoodForId(targetFoodToChangeId!);
        }

        const foodUnderTargetCategory = allFood.filter((eachFoodInAllFood) => {
            if (targetFood) {
                return (
                    eachFoodInAllFood.food_category === targetFood.food_category
                );
            } else {
                return eachFoodInAllFood.food_category === targetFoodCategory;
            }
        });

        this.foodAvailableForUpdate = foodUnderTargetCategory
            .filter(
                (eachFoodInAllFood) =>
                    !this.menuProjection?.some(
                        (eachFoodInMenu) =>
                            eachFoodInMenu.id === eachFoodInAllFood.food_id
                    )
            )
            .map((food) => this.convertFoodToFoodProjection(food));

        this.setLoadingFoodAvailableForUpdate(false);
    };

    saveFoodThisWeek = () => {
        if (!this.menu) {
            return;
        }
        this.userStore.saveMenu(this.menu!);
    };

    setQuantityForCategory = (
        category: IFoodCategory,
        quantityToShow: number
    ) => {
        if (!quantityToShow || quantityToShow < 0) {
            return;
        }
        localStorage.setItem(`${category}-quantity`, quantityToShow.toString());
    };

    private getFoodForId = async (id: string): Promise<IFood> => {
        if (!this.allFood) {
            this.allFood = await this.retrieveAllFood();
        }
        const result = this.allFood.find((item) => item.food_id === id);

        if (!result) {
            throw new Error(`Can't find food for id: ${id}`);
        }
        return result;
    };

    getFoodProjectionById = async (
        id: string
    ): Promise<IFoodProjection | null> => {
        try {
            this.loadingFood = true;

            const food = await this.getFoodForId(id);
            if (!food) {
                this.loadingFood = false;
                return null;
            }
            this.loadingFood = false;
            return this.convertFoodToFoodProjection(food!);
        } catch (e) {
            this.error = e;
            this.loadingFood = false;
            return null;
        }
    };

    // private getAvailableCategories = () => {
    // const copyFood = this.allFood!.slice();
    // const category = copyFood
    //   .map((food) => food.food_category)
    //   .filter((category, index, self) => self.indexOf(category) === index);

    // return category.map((category) => {
    //   let quantity: number;
    //   const defaultQuantity = 7; //TODO
    //   if (!this.userStore.getFoodCategoryQuantityForCategory(category)) {
    //     quantity = defaultQuantity;
    //     this.userStore.saveFoodCategoryQuantityForCategroy(category, defaultQuantity);
    //   } else {
    //     quantity = this.userStore.getFoodCategoryQuantityForCategory(category)!;
    //   }

    //   return {
    //     category: category,
    //     quantity,
    //     };
    //   });
    // };

    getRandomFoodForCategory = async (
        category: IFoodCategory,
        quantityToShow: number
    ): Promise<IFood[]> => {
        const allFood = await this.retrieveAllFood();
        let foodUnderGivenCategory = allFood.filter(
            (food) => food.food_category === category
        );

        if (quantityToShow > foodUnderGivenCategory.length) {
            console.log(
                'Number of food required to show is larger than the number of food in the database.'
            );
            quantityToShow = foodUnderGivenCategory.length;
        }

        const foodToReturn: IFood[] = [];
        for (let i = 0; i < quantityToShow; i++) {
            const randomIndex = Math.floor(
                Math.random() * foodUnderGivenCategory.length
            );
            const randomFood = foodUnderGivenCategory.splice(randomIndex, 1)[0];
            foodToReturn.push(randomFood);
        }
        return foodToReturn;
    };

    // setTargetFoodIdToChange = (id: string) => {
    //   this.targetFoodToChangeId = id;
    // };

    changeFood = async (foodIdToBeChanged: string, foodIdToChange: string) => {
        this.menu = await Promise.all(
            this.menu!.map(async (food) => {
                if (food.food_id === foodIdToBeChanged) {
                    const food = await this.getFoodForId(foodIdToChange)!;

                    return food;
                }
                return food;
            })
        );

        //Resetting the foodchange-related values
        this.newFoodToActionOnId = '';
    };

    addFood = async (foodToAddId: string) => {
        const foodToAdd = await this.getFoodForId(foodToAddId);

        if (!foodToAdd) {
            throw new Error('Can not find food to add');
        }
        this.menu = [...this.menu!, foodToAdd];
        this.newFoodToActionOnId = '';
    };

    getIngredientById = (id: string): IIngredient | undefined => {
        if (!this.allIngredients) {
            throw new Error('No ingredients');
        }
        return this.allIngredients!.slice().find((ing) => ing.id === id);
    };

    convertFoodToFoodProjection = (food: IFood): IFoodProjection => {
        let foodProjection: IFoodProjection = {
            id: food.food_id,
            name: food.food_name,
            category: food.food_category,
            imgUrl: food.img_url,
            ingredients: [],
        };

        food.food_ingredients.forEach((foodIngredient) => {
            const ingredient = this.getIngredientById(foodIngredient.id);
            if (!ingredient) {
                alert(`Can't find the ingredient!${foodIngredient.id}`);
                return;
            }
            foodProjection.ingredients.push({
                id: ingredient!.id,
                name: ingredient!.name,
                category: ingredient!.category,
                quantity: foodIngredient.quantity,
                unit: ingredient!.unit,
            });
        });
        return foodProjection;
    };

    toggleIngredientState = (ingredientId: string) => {
        const index = this.listOfCheckedIngredientIds.indexOf(ingredientId);
        if (index >= 0) {
            this.listOfCheckedIngredientIds.splice(index, 1);
        } else {
            this.listOfCheckedIngredientIds.push(ingredientId);
        }

        this.userStore.saveListOfCheckedIngredientIds(
            this.listOfCheckedIngredientIds
        );
    };

    removeFood = (foodId: string) => {
        this.menu = this.menu!.filter((food) => food.food_id !== foodId);
    };
}
