import pg, {Pool, QueryResult} from 'pg';
import dotenv from 'dotenv';
import { Account, Chat, Favorite, Item, PostgresError } from '../models/databaseObjects.js';
import { generateTokens } from '../security/tokens/tokens.js';
import { FilteredItemResult, LoginOperationResponse } from '../models/dtos.js';
import { buildParamList } from '../utils/utils.js';
import { chatLogger } from '../loggers/logger.js';

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
   async logUserIn(username: string, password: string): Promise<LoginOperationResponse> {
        const sql = `SELECT * FROM accounts WHERE username=$1 AND password=$2`;
        const acctInfoResponse: QueryResult<Account> = (await this.db.connection.query(sql, [username, password]));
        if (acctInfoResponse.rowCount) {
            // generate the user's tokens
            let acctInfo: Account = acctInfoResponse.rows[0];
            const tokens = generateTokens(acctInfo.username, acctInfo.accountid!);
            acctInfo.refreshtoken = tokens.refreshToken;

            // now update the account model in the db with the new refresh token
            const userUpdated = await this.updateUser(acctInfo);

            if (userUpdated) {
                // return the access token to the client for future use
                return {accessToken: tokens.accessToken, userLoggedIn: true, updateError: false};
            } else {
                return {accessToken: '', userLoggedIn: false, updateError: true};
            }
        } else {
            return {accessToken: '', userLoggedIn: false, updateError: false};
        }
   }

   async updateUser(acct: Account) {
        const sql = `
            UPDATE 
                accounts
            SET
                username=$1,
                accounttype=$2,
                email=$3,
                password=$4,
                avatarurl=$5,
                userrating=$6,
                address=$7,
                zipcode=$8,
                refreshtoken=$9
            WHERE
                username=$1
        `;
        
        const userUpdated: number = (await this.db.connection.query(sql, [
            acct.username, acct.accounttype, acct.email, acct.password,
            acct.avatarurl, acct.userrating, acct.address, acct.zipcode, acct.refreshtoken
        ])).rowCount;

        if (userUpdated) {
            return true
        } else {
            return false;
        }
   }

   async addFavorite(newFav: Favorite) {

   }

   async deleteFavorite(fav: Favorite) {
       
   }

   async findRefreshTokenByUser(username: string) {
       const sql = "SELECT refreshtoken FROM accounts WHERE username=$1";
       const refresher: string = (await this.db.connection.query(sql, [username])).rows[0].refreshtoken;
       return refresher;
   }
}

class ItemDataOperations {
    private static _itemInstance: ItemDataOperations;
    private db: DatabaseOperations = DatabaseOperations.DBConnector;

    private constructor() {}

    public static get GetItemDataOpsInstance() {
        return this._itemInstance || (this._itemInstance = new this());
    }

    /** for inserting a single item into the database. returns true if successful and false otherwise.
     * @param newItem the item to insert
     */
    async postItem(newItem: Item) {
        const sql = `
            INSERT INTO
                items
                (accountid, image1, image2, image3, isavailable, pickedup, zipcode, dateposted, name, description)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        const insertedRowCount = (await this.db.connection.query(
            sql,
            [
                newItem.accountid, newItem.image1, newItem.image2, newItem.image3, 
                newItem.isavailable, newItem.pickedup, newItem.zipcode, newItem.dateposted,
                newItem.name, newItem.description
            ])).rowCount;
        
        if (insertedRowCount) {
            return true;
        } else {
            return false;
        }
    }
 
    /** for inserting multiple items into the database. returns true if successful and false otherwise.
     * @param newItemsArray an array of the items to be inserted into the database.
     */
    async bulkPostItems(newItemsArray: Item[]) {
        let sqlParamHolder = "";

        // build out the parameter blocks that will be used to hold the values e.g. ($1, $2, $3....)
        for (let index = 1; index < (newItemsArray.length+1); index++) {
            if (index !== newItemsArray.length) {
                let paramCounter = index*10;
                // sqlParamHolder += `(${buildParamList(paramCounter)})`;
                sqlParamHolder += `($${paramCounter-9}, $${paramCounter-8}, $${paramCounter-7}, $${paramCounter-6}, $${paramCounter-5}, $${paramCounter-4}, $${paramCounter-3}, $${paramCounter-2}, $${paramCounter-1}, $${paramCounter}),`;
            } else {
                let paramCounter = index*10;
                sqlParamHolder += `($${paramCounter-9}, $${paramCounter-8}, $${paramCounter-7}, $${paramCounter-6}, $${paramCounter-5}, $${paramCounter-4}, $${paramCounter-3}, $${paramCounter-2}, $${paramCounter-1}, $${paramCounter})`;
            }
        };

        // postgres is expecting a flat array of values, so build one.
        let arrayOfValues: any[] = [];
        newItemsArray.forEach((x: Item) => {
            arrayOfValues.push(
                x.accountid, x.image1, x.image2, x.image3, x.isavailable,
                x.pickedup, x.zipcode, x.dateposted, x.name, x.description
            );
        });

        const sql = `
            INSERT INTO
                items
                (accountid, image1, image2, image3, isavailable, pickedup, zipcode, dateposted, name, description)
            VALUES
                ${sqlParamHolder}
        `;
        const dataInserted: number = (await this.db.connection.query(sql, arrayOfValues)).rowCount;
        if (dataInserted) {
            return true;
        } else {
            return false;
        }
    }
 
    async deleteItem(itemId: number) {
        const sql = "DELETE FROM items WHERE id=$1";
        const deleteResult: number = (await this.db.connection.query(sql, [itemId])).rowCount;
        return !!deleteResult;
    }
 
    async bulkDeleteItems(ids: number[]) {
        let deleteParams = buildParamList(ids.length);
        const sql = `DELETE FROM items WHERE id IN (${deleteParams})`;
        const deletionResult: number = (await this.db.connection.query(sql, ids)).rowCount;
        return !!deletionResult;
    }
 
    async updateItem(newItem: Item) {
        const valuesList: any[] = [];
        valuesList.push(
            newItem.accountid, newItem.image1, newItem.image2, newItem.image3, newItem.isavailable,
            newItem.pickedup, newItem.zipcode, newItem.dateposted, newItem.name, newItem.description, newItem.id
        );
        const sql = `
            UPDATE items
            SET
                accountid =$1, 
                image1 =$2, 
                image2 =$3, 
                image3 =$4, 
                isavailable =$5, 
                pickedup =$6, 
                zipcode =$7, 
                dateposted =$8, 
                name =$9, 
                description =$10
            WHERE
                id=$11
        `;
        const itemUpdated = (await this.db.connection.query(sql, valuesList)).rowCount;
        return (itemUpdated ? true : false);
    }

    async fetchItems(limit: string, offset: string, zipcode: number | number[], categories?: number[]) {
        if (Array.isArray(zipcode)){
            // build the param list
            const zipcodeParamList = buildParamList(zipcode.length);
            const paramList: any[] = zipcode.map(x => x);
            paramList.push(limit, offset);
            const sql = `
                SELECT * 
                FROM items
                WHERE 
                    zipcode IN (${zipcodeParamList}) 
                    AND isavailable=true 
                    AND pickedup=false
                ORDER BY dateposted DESC
                LIMIT $${zipcode.length + 1}
                OFFSET $${zipcode.length + 2}
            `;
            const results: Item[] = (await this.db.connection.query(sql, paramList)).rows;
            return results;
        } else {
            const sql = `
                SELECT * 
                FROM items
                WHERE 
                    zipcode=$1 
                    AND isavailable=true 
                    AND pickedup=false
                ORDER BY dateposted DESC
                LIMIT $2
                OFFSET $3
            `;
            const results: Item[] = (await this.db.connection.query(sql, [zipcode, limit, offset])).rows;
            return results;
        }
    }

    /** use this method to return items that have been filtered by category and location
     * @param zipcodes an array of zipcodes to search within
     * @param categoryIds an array of categories to search within
     */
    async fetchFilteredItems(categoryIds: number[], limit: number, offset: number, longAndLat: string, miles: number = 5) {
        //const zipcodeParamList = buildParamList(zipcodes.length);
        const categoryParamList = buildParamList(categoryIds.length);
        /**category values 1st, zipcodes second. */
        const valuesList: number[] = [...categoryIds];
        //valuesList.push(limit, offset);
        const sql = `
            SELECT
                items.id, items.name, items.description, 
                items.accountid as "owner", category.description as category,
                items.isavailable, items.pickedup, items.dateposted
            FROM items
            INNER JOIN item_categories ON item_categories.itemid = items.id
            INNER JOIN category ON item_categories.category = category.id
            WHERE item_categories.category IN (${categoryParamList})
            AND isavailable=true
            AND pickedup=false
            AND (items.geolocation<@>'${longAndLat}') < ${miles}
            ORDER BY dateposted DESC
            LIMIT ${limit}
            OFFSET ${offset}
        `;
        const records: FilteredItemResult[] = (await this.db.connection.query(sql, valuesList)).rows;
        return records;

        //     SELECT
        //     items.id, items.name, items.description, items.accountid, 
        //    category.description as Category, category.id as "Category ID",
        //    items.isavailable,
        //     items.pickedup, items.dateposted, 
        //     (items.geolocation<@>'(-94.594299, 39.044432)') as distance
        // FROM items
        // INNER JOIN item_categories ON item_categories.itemid = items.id
        // INNER JOIN category ON item_categories.category = category.id
        // WHERE item_categories.category IN (1,2,3,4,5)
        // AND (items.geolocation<@>'(-94.594299, 39.044432)') > 10

        // use this version of the query if I want to bypass sending in a geolocation everytime
        //     SELECT
        //     items.id, items.name, items.description, items.accountid, 
        //    category.description as Category, category.id as "Category ID",
        //    items.isavailable,
        //     items.pickedup, items.dateposted, 
        //     (items.geolocation<@>'(-94.594299, 39.044432)') as distance
        // FROM items
        // INNER JOIN item_categories ON item_categories.itemid = items.id
        // INNER JOIN category ON item_categories.category = category.id
        // WHERE item_categories.category IN (1,2,3,4,5)
        // AND (items.geolocation<@>(select
        //                                   geolocation
        //                           from 
        //                                   accounts
        //                              where 
        //                                  username='admin')) > 10
    }

    async fetchTotalRecordCount(limit: string, offset: string, zipcode: number, categories?: number[]) {
        const sql = `
            SELECT COUNT(*) 
            FROM items
            WHERE zipcode=$1 AND isavailable=true AND pickedup=false
            ORDER BY dateposted DESC
            LIMIT $1
            OFFSET $2
        `;
        const count: number = (await this.db.connection.query(sql, [zipcode, limit, offset])).rows[0].count;
        return count;
    }
}

class ChatDataOperations {
    private static _instance: ChatDataOperations;
    private db: DatabaseOperations = DatabaseOperations.DBConnector;

    private constructor() {}

    public static get ChatDataOpsInstance() {
        return this._instance || (this._instance = new this());
    }

    addMsg(chatBlock: Chat) {
        const sql = `
            INSERT INTO 
                messages (senderid, recid, message, timestamp)
            VALUES
                ($1, $2, $3, $4)
        `;
        this.db.connection.query(sql, [chatBlock.senderid, chatBlock.recid, chatBlock.message, chatBlock.timestamp])
        .then(res => {})
        .catch((err: PostgresError) => {
            chatLogger.error(`Could't log user's chat. Code: ${err.code} Detail: ${err.detail}`);
        })
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

    /** fetch the full chat history between two users. The oldest message will be the first element in the array (ascending order) */
    async getChatHistoryBetweenUsers(senderAccountId: number, receiverAccountId: number) {
        const sql = `
            SELECT * FROM messages
            WHERE senderid=$1 AND recid=$2
            ORDER BY timestamp asc
        `;
        const chatLog: Chat[] = (await this.db.connection.query(sql, [senderAccountId, receiverAccountId])).rows;
        return chatLog;
    }
}

/** database methods for user operations */
export const userOps = UserDataOperations.GetUserOpsInstance;
/** database methods for flower/item operations */
export const itemOps = ItemDataOperations.GetItemDataOpsInstance;
/** database methods for user chat operations */
export const chatOps = ChatDataOperations.ChatDataOpsInstance;