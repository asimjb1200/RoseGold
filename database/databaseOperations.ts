import pg, {Pool, QueryResult} from 'pg';
import dotenv from 'dotenv';
import { Account, Chat, Favorite, Item } from '../models/databaseObjects.js';
import { generateTokens } from '../security/tokens/tokens.js';

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

    async addNewUser(acct: Account) {
        const sql = `
            INSERT INTO accounts 
                (
                    username, accounttype, email, password,
                    avatarurl, userrating, address, zipcode, refreshtoken
                )
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const newUser = (
                            await this.db.connection.query(
                                sql, 
                                [
                                    acct.username, acct.accounttype, acct.email, acct.password,
                                    acct.avatarurl, acct.userrating, acct.address, acct.zipcode, acct.refreshtoken
                                ]
                            )
                        );

        return (newUser.rowCount ? true : false);
    }

    async deleteUser(username: string) {

    }

    /** search the db for the user's creds. If found, this will generate access and refresh tokens for the user. The refresh token will
     * be stored in the db for later use.
     * @param username the user's username
     * @param password the user's password hash
     * @returns an access token for the client
     */
   async logUserIn(username: string, password: string): Promise<string|null> {
        const sql = `SELECT * FROM accounts WHERE username=$1 AND password=$2`;
        const acctInfoResponse: QueryResult<Account> = (await this.db.connection.query(sql, [username, password]));
        if (acctInfoResponse.rowCount) {
            // generate the user's tokens
            let acctInfo: Account = acctInfoResponse.rows[0];
            const tokens = generateTokens(acctInfo.username);

            // now update the account model in the db with the new refresh token

            // return the access token to the client for future use
            return tokens.accessToken;
        } else {
            return null;
        }
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

/** database methods for user operations */
export const userOps = UserDataOperations.GetUserOpsInstance;
/** database methods for flower/item operations */
export const itemOps = ItemDataOperations.GetItemDataOpsInstance;
/** database methods for user chat operations */
export const chatOps = ChatDataOperations.ChatDataOpsInstance;