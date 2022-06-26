import pg, {Pool, QueryResult} from 'pg';
import dotenv from 'dotenv';
import { Account, Chat, Favorite, Item, PasswordRecorvery, PostgresError } from '../models/databaseObjects.js';
import { generateTokens } from '../security/tokens/tokens.js';
import { ChatWithUsername, FilteredItemResult, ItemDataForClient, LoginOperationResponse } from '../models/dtos.js';
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
                    avatarurl, userrating, address, zipcode, refreshtoken, geolocation,
                    firstname, lastname
                )
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `;
        const newUser = (
                            await this.db.connection.query(
                                sql, 
                                [
                                    acct.username, acct.accounttype, acct.email, acct.password,
                                    acct.avatarurl, acct.userrating, acct.address, acct.zipcode, acct.refreshtoken, acct.geolocation,
                                    acct.firstname, acct.lastname
                                ]
                            )
                        );

        return (newUser.rowCount ? true : false);
    }

    /** use this method for forgot password route. this will ensure that the
     * email address passed in by the user is actually associated with the username 
     * that is sent over
     */
    getEmailByUsername(username: string): Promise<pg.QueryResult<{email: string}>> {
        const sql = "SELECT email FROM accounts WHERE username=$1";
        return this.db.connection.query(sql, [username]);
    }

    /** use this method for inserting data into the password recovery table */
    insertUserIntoPWRecovery(username:string, securityCode:string) {
        const sql = "INSERT INTO password_recovery (username, security_code, created) VALUES ($1, $2, now())";
        return this.db.connection.query(sql, [username, securityCode]);
    }

    /** use after you've provided a user their security code for their password reset. this will then remove them from the password recovery table */
    deleteFromPWRecovery(username: string) {
        const sql = "DELETE FROM password_recovery WHERE username=$1";
        return this.db.connection.query(sql, [username]);
    }

    findUserBySecurityCode(securityCode:string): Promise<pg.QueryResult<PasswordRecorvery>> {
        const sql = 'SELECT * FROM password_recovery WHERE security_code=$1';
        return this.db.connection.query(sql, [securityCode]);
    }

    /** update the user's password in the database */
    updateUserPassword(username:string, newPassword:string) {
        const sql = 'UPDATE accounts SET password=$1 WHERE username=$2';
        return this.db.connection.query(sql, [newPassword, username]);
    }

    /** used when a user wants to see all of the items that they have listed. Returns an array of item names and ids. Intended to be used in a list view on the client.
     * @param accountId - the owner of the items to be returned
     */
    async itemsOwnedByAccountId(accountId:string) {
        const sql = "select id, name from items where accountid=$1";
        return this.db.connection.query(sql, [accountId]);
    }

    async getUserGeolocation(accountid:number) {
        const sql = 'select geolocation from accounts where accountid=$1';
        return this.db.connection.query(sql, [accountid]);
    }

    async getAddressInfo(accountId:string) {
        const sql = `
            select address, zipcode from accounts where accountid=$1
        `;

        return this.db.connection.query(sql, [accountId]);
    }

    async getUsername(accountId: number) {
        const sql = "select username from accounts where accountid=$1";
        let username:string = (await this.db.connection.query(sql, [accountId])).rows[0].username;
        return username;
    }

    async deleteUser(accountId: number) {
        const sql = 'DELETE FROM accounts WHERE accountid=$1';
        return this.db.connection.query(sql, [accountId]);
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
                return {accessToken: tokens.accessToken, userLoggedIn: true, updateError: false, accountId: acctInfo.accountid!};
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

   async updateUserAddress(newFullAddress:string, newZip:number, newGeolocation:string, accountId:number) {
       const sql = `
            UPDATE accounts
            SET address=$1, zipcode=$2, geolocation=$3
            WHERE accountid=$4
       `;

       return this.db.connection.query(sql, [newFullAddress, newZip, newGeolocation, accountId]);
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
                (accountid, image1, image2, image3, isavailable, pickedup, zipcode, dateposted, name, description, geolocation)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (SELECT geolocation FROM accounts WHERE accountid=$1))
            RETURNING id
        `;
        return this.db.connection.query(
            sql,
            [
                newItem.accountid, newItem.image1, newItem.image2, newItem.image3, 
                newItem.isavailable, newItem.pickedup, newItem.zipcode, newItem.dateposted,
                newItem.name, newItem.description
            ]);
    }

    async postItemCategories(itemId: number, categories: number[]) {
        let valueParamsForInsert = '';
        // build out the value sets that the query will use
        for (let index = 1; index < categories.length+1; index++) {
            if (index == categories.length) {
                valueParamsForInsert += `($1, $${index+1})`
            } else {
                valueParamsForInsert += `($1, $${index+1}),`
            }
        }

        const sql = `
            INSERT INTO 
                item_categories (itemid, category)
            VALUES
                ${valueParamsForInsert}
            ON CONFLICT (itemid, category) DO NOTHING;
        `;
        const values: number[] = [];
        values.push(itemId, ...categories);
        return this.db.connection.query(sql, values);
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
                sqlParamHolder += `($${paramCounter-9}, $${paramCounter-8}, $${paramCounter-7}, $${paramCounter-6}, $${paramCounter-5}, $${paramCounter-4}, $${paramCounter-3}, $${paramCounter-2}, $${paramCounter-1}, $${paramCounter}, (SELECT geolocation FROM accounts WHERE accountid=${paramCounter-9})),`;
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
                (accountid, image1, image2, image3, isavailable, pickedup, zipcode, dateposted, name, description, geolocation)
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
 
    /** delete an item from the db. this will also delete the item from the `item_categories` table due to a cascade being set up
     * @param itemId - the id of the item to be deleted
     */
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
    async fetchFilteredItems(categoryIds: number[], limit: number, offset: number, longAndLat: string, miles: number = 10, searchTerm = ''): Promise<FilteredItemResult[]> {
        let sql: string;
        let records: FilteredItemResult[];
        if (categoryIds.length) {
            const categoryParamList = buildParamList(categoryIds.length);
            const valuesList: number[] = [...categoryIds];

            sql = `
                SELECT
                    items.id, items.name, items.description, items.image1, items.image2, items.image3,
                    items.accountid as "owner", category.description as category,
                    items.isavailable, items.pickedup, items.dateposted, (select username from accounts where accountid = items.accountid) as "ownerUsername"
                FROM items
                INNER JOIN item_categories ON item_categories.itemid = items.id
                INNER JOIN category ON item_categories.category = category.id
                WHERE item_categories.category IN (${categoryParamList})
                ${searchTerm.length ? "AND items.name LIKE '%"+searchTerm+"%'": ''}
                AND isavailable=true
                AND pickedup=false
                AND (items.geolocation<@>'${longAndLat}') < ${miles}
                ORDER BY dateposted DESC
                LIMIT ${limit}
                OFFSET ${offset}
            `;
            records = (await this.db.connection.query(sql, categoryIds)).rows;
        } else {
            sql = `
                SELECT
                    items.id, items.name, items.description, items.image1, items.image2, items.image3,
                    items.accountid as "owner", category.description as category,
                    items.isavailable, items.pickedup, items.dateposted,  (select username from accounts where accountid = items.accountid) as "ownerUsername"
                FROM items
                INNER JOIN item_categories ON item_categories.itemid = items.id
                INNER JOIN category ON item_categories.category = category.id
                WHERE item_categories.category IN ((select id from category))
                ${searchTerm.length ? "AND items.name LIKE '%"+searchTerm+"%'": ''}
                AND isavailable=true
                AND pickedup=false
                AND (items.geolocation<@>'${longAndLat}') < ${miles}
                ORDER BY dateposted DESC
                LIMIT ${limit}
                OFFSET ${offset}
            `;
            records = (await this.db.connection.query(sql)).rows;
        }

        return records;
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

    async fetchUsersItems(accountId:string) {
        const sql = `
            SELECT
            items.id, items.name, items.description, items.image1, items.image2, items.image3,
            items.accountid as "owner", category.description as category,
            items.isavailable, items.pickedup, items.dateposted
            FROM items
            INNER JOIN item_categories ON item_categories.itemid = items.id
            INNER JOIN category ON item_categories.category = category.id
            WHERE items.accountId=$1
            order by items.id
        `;
        const items: FilteredItemResult[] = (await this.db.connection.query(sql, [accountId])).rows;

        return items;
    }

    /** fetch every category id that an item belongs to
     * @param itemId - the id of the item to get the categories for
     */
    async fetchCategoriesForItem(itemId:string) {
        const sql = `
            select category.description from item_categories 
            INNER JOIN category ON item_categories.category = category.id
            where itemid=$1
        `;
        return this.db.connection.query(sql, [itemId]);
    }

    /** fetch the details for a single item from the table
     * @param itemId - the id of the item to get the details for
     */
    async fetchItemData(itemId:string) {
        const sql = "select * from items where id=$1";
        return this.db.connection.query(sql, [itemId]);
    }
}

class ChatDataOperations {
    private static _instance: ChatDataOperations;
    private db: DatabaseOperations = DatabaseOperations.DBConnector;

    private constructor() {}

    public static get ChatDataOpsInstance() {
        return this._instance || (this._instance = new this());
    }

    /** Inserts the new chat message between 2 users into the database so that their history is maintained */
    async addMsg(chatBlock: Chat) {
        let chatData:Chat = chatBlock;
        let {id, senderid, recid, message, timestamp} = chatBlock;
        const sql = `
            INSERT INTO 
                messages (id, senderid, recid, message, timestamp)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const newChat: Chat = (await this.db.connection.query(sql, [id, senderid, recid, message, timestamp])).rows[0];
        return newChat;
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

    /** fetch every chat msg where the user is the sender
     * @param accountId - the account id that should be the sender */
    async getAllChatsForMsgs(accountId: number|string) {
        const sql = `
            select 
                messages.*, 
                accounts.username as "senderUsername", 
                (select username from accounts where accountid = recid) as "receiverUsername"
            from messages
            inner join accounts
            on messages.senderid = accounts.accountid 
            where senderid = $1 OR recid = $1
            order by messages.timestamp asc
        `;

        const chatMsgs: ChatWithUsername[] = (await this.db.connection.query(sql, [accountId])).rows;
        return chatMsgs;
    }
}

/** database methods for user operations */
export const userOps = UserDataOperations.GetUserOpsInstance;
/** database methods for flower/item operations */
export const itemOps = ItemDataOperations.GetItemDataOpsInstance;
/** database methods for user chat operations */
export const chatOps = ChatDataOperations.ChatDataOpsInstance;