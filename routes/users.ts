import express from "express";
import { Request, Response } from "express";
import {body, check, Result, validationResult} from "express-validator";
import { itemOps, userOps } from "../database/databaseOperations.js";
import { userLogger } from "../loggers/logger.js";
import { Account, isPostgresError, Item } from "../models/databaseObjects.js";
import { FilteredItemResult, GroupedItems, ItemDataForClient, LoginOperationResponse, ResponseForClient, TempUser } from "../models/dtos.js";
import {createHash, Hash} from 'crypto';
import { groupBy } from "../utils/utils.js";
let router = express.Router();

router.post(
    '/register-user',
    [
        check('email').isEmail().normalizeEmail(),
        check('username').notEmpty().isAlphanumeric(),
        check('password').notEmpty().isAlphanumeric().isLength({min: 8, max: 16}),
        check('avatarUrl').notEmpty().isURL(),
        check('address').notEmpty().isAlphanumeric('en-US', {ignore: ' '}),
        check('city').notEmpty().isAlpha('en-US', {ignore: ' '}),
        check('state').notEmpty().isAlpha('en-US', {ignore: ' '}).isLength({max: 2}), //will be using state abbrs.
        check('zipcode').notEmpty().isInt().isLength({max: 5}),
        check('accountType').notEmpty().isInt({min: 0, max: 1})
    ],
    async (req: Request, res: Response) => {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(422).json({errors: validationErrors.array()});
        }

        const rawUser: TempUser = req.body;
        const dbUser: Account = {
            username: rawUser.username,
            userrating: 0,
            password: rawUser.password,
            address: `${rawUser.address} ${rawUser.city} ${rawUser.state}`,
            zipcode: rawUser.zipcode,
            accounttype: req.body.accountType,
            email: rawUser.email,
            refreshtoken: '',
            avatarurl: rawUser.avatarUrl
        };

        // hash the user's password. crypto module uses utf8 encoding by default
        const hashObj: Hash = createHash('sha256');
        hashObj.update(dbUser.password);
        dbUser.password = hashObj.digest('hex');

        try {
            let userInserted = await userOps.addNewUser(dbUser);
            userLogger.info(`New user created: ${dbUser.username}`);
            return res.status(200).json({msg: 'user created'});
        } catch (error: any) {
            if (isPostgresError(error)) {
                if (error.constraint && error.constraint == 'username_taken') {
                    return res.status(409).json({msg: 'username taken'});
                } else {
                    userLogger.error(`error code ${error.code} when trying to create a new user: ${error.detail}`);
                    return res.status(500).json('there was an error in the db');
                }
            } else {
                userLogger.error(`error while trying to create a user: ${error}`);
                return res.status(500).json({msg: 'user not created'});
            }
        }
    }
);

router.post(
    '/login',
    [
        check('username').notEmpty().isAlphanumeric(),
        check('password').notEmpty().isAlphanumeric().isLength({min: 8, max: 16})
    ],
    async (req: Request, res: Response) => {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(422).json({errors: validationErrors.array()});
        }
        const {username, password} = req.body;
        // hash the pw before checking the db
        const hashObj: Hash = createHash('sha256');
        hashObj.update(password);
        let pwHash: string = hashObj.digest('hex');

        try {
            let loginStatus: LoginOperationResponse = await userOps.logUserIn(username, pwHash);
            if (loginStatus.userLoggedIn) {
                let data = loginStatus.accessToken;
                const responseForClient = {data, error: []} as ResponseForClient<string>;
                userLogger.info(`${username} just logged in.`);
                return res.status(200).json(responseForClient);
            } else if(!loginStatus.updateError && !loginStatus.userLoggedIn) {
                userLogger.info(`bad password combo attempted. couldn't locate ${username} and ${password} in db`);
                const responseForClient = {data: '', error: ["couldn't find your login info"]} as ResponseForClient<string>;
                return res.status(404).json(responseForClient);
            } else {
                const responseForClient = {data: '', error: ["an internal error occurred. try again later"]} as ResponseForClient<string>;
                return res.status(500).json(responseForClient);
            }
        } catch (err) {
            if (isPostgresError(err)) {
                userLogger.error(`when trying to log ${username} in: ${err.detail}`);
                let resObj = {data: '', error: [err.detail]} as ResponseForClient<any>;
                return res.status(500).json(resObj);
            } else {
                userLogger.error(`when trying to log ${username} in: ${err}`);
                let resObj = {data: '', error: [err]} as ResponseForClient<any>;
                return res.status(500).json(resObj);
            }
        }
    }
);

router.get('/items', async (req:Request, res:Response) => {
    const accountId = req.query.accountId;
    if (!accountId) return res.status(500).json('no account id provided');
    // I will grab the user's avatar from the front end and I'll 
    try {
        // grab the user's items from the db
        let usersItems:FilteredItemResult[] = await itemOps.fetchUsersItems(accountId as string);

        // group the items with the same id together into arrays under their id number as the key
        const itemsGroupedById: GroupedItems = groupBy(usersItems, "id");
        let finalItemArray: ItemDataForClient[] = [];

        // now go through each key and create a single item with all of the item's categories put into a list
        for (const itemIdKey in itemsGroupedById) {
            const itemDTOS = itemsGroupedById[itemIdKey];
            const categoryListForItem: string[] = itemDTOS.reduce((arrayOfCategories: string[], itemDTO: FilteredItemResult) => {
                arrayOfCategories.push(itemDTO.category);
                return arrayOfCategories;
            }, []);
            const firstItem = itemDTOS[0]; // all items under the current key are the same, so pick any one to use for grabbing info

            const item: ItemDataForClient = {
                id: +itemIdKey, name: firstItem.name, description: firstItem.description, dateposted: firstItem.dateposted,
                isavailable: firstItem.isavailable, pickedup: firstItem.pickedup, categories: categoryListForItem, owner: firstItem.owner,
                image1: firstItem.image1, image2: firstItem.image2, image3: firstItem.image3
            }

            finalItemArray.push(item);
        }
        const responseForClient = { data: finalItemArray, error: [] } as ResponseForClient<ItemDataForClient[]>;
        
        return res.status(200).json(responseForClient);
    } catch (err) {
        if (isPostgresError(err)) {
            userLogger.error(`encountered a problem trying to fetch items for user ${accountId}. The error ${err.code}: ${err.detail}`);
            return res.status(500).json('an error occurred');
        }
    }

});

export default router;