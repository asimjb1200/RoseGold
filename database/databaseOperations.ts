import pg, {Pool} from 'pg';
import dotenv from 'dotenv';
import { Account, Chat, Favorite, Item } from '../models/databaseObjects.js';
import { resolve } from 'path/posix';

dotenv.config();

class DatabaseOperations {
    public connection: Pool = new pg.Pool({
        user: process.env.PGUSER,
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        port: 5432
    });
    private static _instance: DatabaseOperations;
    private constructor() {}
    public static get DBConnector() {
        return this._instance || (this._instance = new this());
    }
}

class UserDataOperations {
    private static _userInstance: UserDataOperations;
    private db: DatabaseOperations = DatabaseOperations.DBConnector

    private constructor(){}
    
    public static get GetUserOpsInstance() {
        return this._userInstance || (this._userInstance = new this());
    }

    async addNewUser(accountInfo: Account) {

    }

    async deleteUser(username: string) {

    }

   async logUserIn() {
       
   }

   async updateUser(usrAccount: Account) {

   }

   async addFavorite(newFav: Favorite) {

   }

   async deleteFavorite(fav: Favorite) {
       
   }
}

class ItemDataOperations {
    private static _itemInstance: ItemDataOperations;
    private db: DatabaseOperations = DatabaseOperations.DBConnector;

    private constructor() {}

    public static get GetItemDataOpsInstance() {
        return this._itemInstance || (this._itemInstance = new this());
    }

    async postItem(newItem: Item) {

    }
 
    async bulkPostItems(newItemsArray: Item[]) {
 
    }
 
    async deleteItem(itemId: number) {
 
    }
 
    async bulkDeleteItems(ids: number[]) {
 
    }
 
    async updateItem(newItem: Item) {
 
    }
}

class ChatDataOperations {
    private static _instance: ChatDataOperations;
    private db: DatabaseOperations = DatabaseOperations.DBConnector;

    private constructor() {}

    public static get ChatDataOpsInstance() {
        return this._instance || (this._instance = new this());
    }

    async addMsg(chatBlock: Chat) {

    }

    async deleteMsg(chatBlock: Chat) {

    }

    async findMsg(searchText: string){
        let data = new Promise<string>((resolve, reject) => {
            setTimeout(() => {
                resolve('Promise complete');
            }, 300);
        });

        const val = await data;
        return val;
    }
}

export const userOps = UserDataOperations.GetUserOpsInstance;
export const itemOps = ItemDataOperations.GetItemDataOpsInstance;
export const chatOps = ChatDataOperations.ChatDataOpsInstance;