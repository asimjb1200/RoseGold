import express from "express";
import { Request, Response } from "express";
import {body, check, Result, validationResult} from "express-validator";
import { itemOps, userOps } from "../database/databaseOperations.js";
import { userLogger } from "../loggers/logger.js";
import { Account, isPostgresError, Item } from "../models/databaseObjects.js";
import { FilteredItemResult, GroupedItems, ItemDataForClient, ItemNameAndId, LoginOperationResponse, ResponseForClient, TempUser, UserForClient } from "../models/dtos.js";
import {createHash, Hash} from 'crypto';
import { groupBy } from "../utils/utils.js";
import { FileSystemFunctions } from "../utils/fileSystem.js";
import multer from "multer";
import { authenticateJWT } from "../security/tokens/tokens.js";
let router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post(
    '/register-user',
    upload.single("avatar")
    ,async (req: Request, res: Response) => {
        let avatarImage = req.file as Express.Multer.File;
        const rawUser: TempUser = req.body;

        // save the user's avatar image
        await FileSystemFunctions.saveAvatarImage(avatarImage);
        const dbUser: Account = {
            username: rawUser.username.trim(),
            userrating: 0,
            password: rawUser.password.trim(),
            address: `${rawUser.address.trim()} ${rawUser.city.trim()} ${rawUser.state.trim()}`,
            zipcode: +rawUser.zipcode.trim(),
            accounttype: 1,
            email: rawUser.email.trim(),
            refreshtoken: '',
            avatarurl: `/Users/asimbrown/Desktop/Dev/Projects/RoseGold/build/images/avatars/${avatarImage.originalname}`,
            geolocation: rawUser.geolocation.trim()
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
                    userLogger.error(`error code ${error.code} when trying to create a new user: ${error}`);
                    return res.status(500).json('there was an error in the db');
                }
            } else {
                console.log(error);
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
                const userForClient:UserForClient = {username, accessToken:loginStatus.accessToken, accountId:loginStatus.accountId!, avatarUrl: `/images/avatars/${username}`};
                const responseForClient = {data:userForClient, error: []} as ResponseForClient<UserForClient>;
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

router.post('/change-address', authenticateJWT, async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');

    // grab the user's new data
    const { newAddress, newCity, newZip, newState, newGeolocation } = req.body;
    const newFullAddress = `${newAddress as string} ${newCity as string} ${newState as string}`;

    try {
        // update the database with the new info
        await userOps.updateUserAddress(newFullAddress, newZip as number, newGeolocation as string, req.user.accountId);
        const responseForClient:ResponseForClient<string> = {data:'data updated', error:[]};
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(204).json(responseForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`Tried to update user ${req.user?.accountId}'s address info: ${error.code} ${error.detail}`);
        }
        console.log(error)
        userLogger.error(`Tried to update user ${req.user?.accountId}'s address info: ${error}`);
        return res.status(500).json('error occurred');
    }
});

router.post('/change-avatar', [authenticateJWT, upload.single("avatar")],async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    try {
        let avatarImage = req.file as Express.Multer.File;
        // save the user's avatar image
        await FileSystemFunctions.saveAvatarImage(avatarImage);
        const responseForClient:ResponseForClient<boolean> = {data:true, error:[]}
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(200).json(responseForClient);
    } catch (error) {
        userLogger.error(`error occurred when trying to replace ${req.user?.username}'s avatar: ${error}`);
        return res.status(500).json('error occurred');
    }
})

router.get('/items', authenticateJWT, async (req:Request, res:Response) => {
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
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(200).json(responseForClient);
    } catch (err) {
        if (isPostgresError(err)) {
            userLogger.error(`encountered a problem trying to fetch items for user ${accountId}. The error ${err.code}: ${err.detail}`);
            return res.status(500).json('an error occurred');
        }
    }

});

router.get('/address-details', authenticateJWT, async (req:Request, res:Response) => {
    // get the account id from the request
    const accountid = req.query.accountId as string;
    // grab the user's address details from the database
    const addressInfo: {address:string, zipcode:number} = (await userOps.getAddressInfo(accountid)).rows[0];
    const responseForClient = {data:addressInfo, error:[]} as ResponseForClient<{address:string, zipcode:number}>;
    if (res.locals.newAccessToken) {
        responseForClient.newToken = res.locals.newAccessToken;
    }
    return res.status(200).json(responseForClient);
});

router.get('/user-items', authenticateJWT, async (req:Request, res:Response) => {
    // grab the account id from the request query
    const accountId = req.query.accountId as string;
    // req.user?.accountId use this one in prod

    try {
        // query the items table for any items owned by this user
        const itemsUnderAccount: ItemNameAndId[] = (await userOps.itemsOwnedByAccountId(accountId)).rows;
        const responseForClient = {data:itemsUnderAccount, error:[]} as ResponseForClient<ItemNameAndId[]>;
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(200).json(responseForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`Tried to fetch items for user 17: ${error.code} ${error.detail}`);
            return res.status(500).json('error occurred');
        } else {
            userLogger.error(`Tried to fetch items for user 16: ${error}`);
            return res.status(500).json('error occurred');
        }
    }
});

export default router;