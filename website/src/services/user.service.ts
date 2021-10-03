import { IFood } from "../../../shared/models/food";

export abstract class UserService {

  public static SaveFoodThisWeekToDb(foodThisWeek: IFood[]): void {
    localStorage.setItem("foodThisWeek", JSON.stringify(foodThisWeek));
  }
}
