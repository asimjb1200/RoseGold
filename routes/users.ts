import express from "express";
import { Request, Response } from "express";
import { body, check, checkSchema, validationResult} from "express-validator";
import { itemOps, userOps } from "../database/databaseOperations.js";
import { userLogger } from "../loggers/logger.js";
import { Account, isPostgresError, PasswordRecorvery, UnverifiedAccount } from "../models/databaseObjects.js";
import { FilteredItemResult, GroupedItems, ItemDataForClient, ItemNameAndId, LoginOperationResponse, ResponseForClient, TempUser, UserForClient } from "../models/dtos.js";
import { buildHashForAccountVerification, groupBy, initUnverifiedAccount, initVerifiedAccount } from "../utils/utils.js";
import { FileSystemFunctions } from "../utils/fileSystem.js";
import multer from "multer";
import { authenticateJWT } from "../security/tokens/tokens.js";
import { emailHandler } from "../emails/EmailHandler.js";
import { generateRandomCode } from "../security/encryption/codeGenerator.js";
import { hashMe } from "../security/hashing/hashStuff.js";

let router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post(
    '/register-user',
    upload.single("avatar"),
    async (req: Request, res: Response) => {
        try {
            let avatarImage = req.file as Express.Multer.File;
            if (avatarImage.mimetype !== 'image/jpg' && avatarImage.mimetype !== 'image/jpeg') {
                throw new Error('Only jpg images are allowed');
            }

            const userFromReq: TempUser = req.body;

            // build the unverified user object
            const unverifiedAccount: UnverifiedAccount = initUnverifiedAccount(userFromReq);
            
            // add the user to the unverified table
            await userOps.addNewUnverifiedUser(unverifiedAccount);
            userLogger.info(`New user added to unverified table: ${unverifiedAccount.username}`);

             // save the user's avatar image
             await FileSystemFunctions.saveAvatarImage(avatarImage);

            // build the hashvalue that will be sent to the user's email address
            const userInformationHash: string = buildHashForAccountVerification(unverifiedAccount, unverifiedAccount.salt);

            // now email the user with the hash value that I've created
            await emailHandler.registrationConfirmationEmail(unverifiedAccount.email, userInformationHash);

            return res.status(200).json({msg: 'user created'});
        } catch (error: any) {
            if (isPostgresError(error)) {
                if (error.detail && error.detail == 'username_taken') {
                    userLogger.error(`error code ${error.code} when trying to create a new user. The attempted username is already in use.`);

                    return res.status(409).json({msg: 'username taken'});
                } else if (error.detail && error.detail == 'email_taken') {
                    userLogger.error(`error code ${error.code} when trying to create a new user. The attempted email address is already in use.`);

                    return res.status(410).json({msg: 'email address taken'});
                } else {
                    userLogger.error(`error code ${error.code} when trying to create a new user: ${error}`);
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
    '/confirm-account', 
    [
        body('usersEmail', 'invalid email').notEmpty().isEmail().normalizeEmail(),
        body('userInformationHash', 'invalid code').notEmpty().isString()
    ], 
    async (req:Request, res:Response) => {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(422).json({ errors: validationErrors.array() });
        }
        try {
            const {userInformationHash, usersEmail} = req.body;

            // grab the unverified_user from the db
            const unverifiedUser:UnverifiedAccount = (await userOps.getUnverifiedAccountByEmail(usersEmail)).rows[0];

            // if the user isn't present..
            if (unverifiedUser  === undefined) {
                return res.status(404).json('user not present');
            }
            
            // recalculate the hash from the user who has this email address and see if the client sent the correct one
            const myCalculatedHash:string = buildHashForAccountVerification(unverifiedUser, unverifiedUser.salt);

            switch (myCalculatedHash === userInformationHash) {
                case true:
                    userLogger.info(`${usersEmail} sent over a correct verification hash.`);
                    // build a verified user object
                    const verifiedUser:Account = initVerifiedAccount(unverifiedUser);

                    // insert it into the main accounts table now
                    const userAdded: boolean = await userOps.addNewUser(verifiedUser);
                    
                    userLogger.info(`A new user has just verified their account: ${unverifiedUser.username}`);

                    // the user can login now
                    return res.status(201).json('hashes match');
                    break;
                case false:
                    userLogger.info(`${usersEmail} did not send a correct verification hash.`);
                    return res.status(401).json('hashes DONT match');
                    break;
            }
        } catch (error) {
            userLogger.error(`error occurred while trying to verify a new user: ${error}`);
            return res.status(500).json('an error occurred');
        }
});

router.post(
    '/login',
    [
        check('email').notEmpty().isString(),
        check('password').notEmpty().isString().isLength({min: 8, max: 20})
    ],
    async (req: Request, res: Response) => {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            userLogger.error(`error during login validation: ${validationErrors}`);
            return res.status(422).json({errors: validationErrors.array()});
        }

        // const {username, password} = req.body;
        const {email, password} = req.body;
        // hash the pw before checking the db
        const pwHash: string = hashMe(password);

        try {
            // let loginStatus: LoginOperationResponse = await userOps.logUserIn(username, pwHash);
            let loginStatus: LoginOperationResponse = await userOps.logUserInWithEmail(email, pwHash);
            if (loginStatus.userLoggedIn) {
                let data = loginStatus.accessToken;
                const userForClient:UserForClient = {username: loginStatus.username, accessToken:loginStatus.accessToken, accountId:loginStatus.accountId!, avatarUrl: `/images/avatars/${loginStatus.username}`};
                const responseForClient = {data:userForClient, error: []} as ResponseForClient<UserForClient>;
                userLogger.info(`${loginStatus.username} just logged in.`);
                return res.status(200).json(responseForClient);
            } else if(!loginStatus.updateError && !loginStatus.userLoggedIn) {
                userLogger.info(`bad password combo attempted. couldn't locate ${email} and ${password} in db`);
                const responseForClient = {data: '', error: ["couldn't find your login info"]} as ResponseForClient<string>;
                return res.status(404).json(responseForClient);
            } else {
                const responseForClient = {data: '', error: ["an internal error occurred. try again later"]} as ResponseForClient<string>;
                return res.status(500).json(responseForClient);
            }
        } catch (err) {
            if (isPostgresError(err)) {
                userLogger.error(`when trying to log ${email} in: ${err.detail}`);
                let resObj = {data: '', error: [err.detail]} as ResponseForClient<any>;
                return res.status(500).json(resObj);
            } else {
                userLogger.error(`when trying to log ${email} in: ${err}`);
                let resObj = {data: '', error: [err]} as ResponseForClient<any>;
                return res.status(500).json(resObj);
            }
        }
    }
);

router.post('/report-user', authenticateJWT, async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');

    // grab the reporting user and reported user ids and the reason
    const {reportingUserId, reportedUserId, reason} = req.body;

    try {
        // add to the database
        await userOps.reportUser(reportingUserId as number, reportedUserId as number, reason as string);

        // send an email to us indicating what happened
        await emailHandler.emailSupport("express server", "User Reported", `User ${reportedUserId} was just reported by user ${reportingUserId} for: \n\t"${reason}".\nCheck the database for details.`);

        return res.status(200).json('success');
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`error while trying to report a user: ${error.code} ${error.hint} ${error.detail}`)
        } else {
            userLogger.error(`error while trying to report a user: ${error}`);
        }
        return res.status(500).json('failed');
    }
});

router.get('/change-username', authenticateJWT, async (req:Request, res:Response) => {
    const newUsername = req.query.newUsername  as string;
    const oldUsername = req.query.oldUsername as string;

    try {
        const updateCompleted = (await userOps.updateUsername(newUsername, oldUsername)).rowCount;

        if (updateCompleted === 1) {
            userLogger.info(`changed username from ${oldUsername} to ${newUsername}`);

            // change their avatar name
            await FileSystemFunctions.renameAvatarImage(newUsername, oldUsername);

            // change their image folder name
            await FileSystemFunctions.renameItemOwnerFolder(newUsername, oldUsername);

            const responseForClient:ResponseForClient<boolean> = {data: true, error: []};

            if (res.locals.newAccessToken){
                responseForClient.newToken = res.locals.newAccessToken;
            }

            return res.status(200).json(responseForClient);
        } else {
            return res.status(500).json({data: true, error: []});
        }
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`error while updating username: ${error.code} ${error.detail}`);
        } else {
            userLogger.error(`error while updating username: ${error}`);
        }
        return res.sendStatus(500);
    }
});

router.get('/check-username', async (req:Request, res:Response) => {
    try {
        const newUsername = req.query.newUsername  as string;

        // see if username is available
        const usernameFound = (await userOps.checkUsernameAvailability(newUsername)).rows[0].count;

        if (usernameFound === '0') {
            return res.status(200).json('0');
        } else {
            return res.status(200).json('1');
        }   
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`error while checking for a username: ${error}`);
            return res.status(500).json('postgres error');
        } else {
            console.log(error);
            return res.status(500).json('error occurred');
        }
    }
 });

router.get('/test-email-conf', async (req: Request, res: Response) => {
    await emailHandler.registrationConfirmationEmail("ajbtech@yahoo.com", "test@mail.com");
    return res.status(200).json("all done");
});

router.post('/forgot-password-step-one', async (req:Request, res:Response) => {
    // extract the user's username and email from the body
    const {emailAddress} = req.body;
    
    try {
        // make sure that username matches that email address
        const emailFound = (await userOps.verifyEmailAddress(emailAddress as string)).rows[0];

        if (typeof emailFound === 'undefined') {
            const responseForClient:ResponseForClient<string> = {data: '', error: ['Could not find that account information in our servers.'], newToken:''};
            userLogger.info(`couldn't find data on this attempted account: ${emailAddress}`);
            return res.status(404).json(responseForClient);  
        }
        
        if (emailFound && emailFound.exists === 1) {
            // generate a 3 byte (6 digit with hex) random code from the returned buffer
            const randomData:string = (await generateRandomCode(3)).toString('hex');

            // store it in the temp pw database
            const userInserted = await userOps.insertUserIntoPWRecovery(emailAddress, randomData);
            
            // email it to the user
            const text = `
            <div style="padding: 15px;">
            <p style="display:block;">Hello, </p>
        
            <p style="display:block;">We’ve received a request to reset the password for the Rose Gold Gardens account associated with “${emailAddress}”. No changes have been made to your account yet.</p>
            <p style="display:block;">You can reset your password by returning to Rose Gold and entering the code below:</p>
            <div style="height:90px;border: 2px solid #466975;line-height:90px;text-align:center;border-radius:5px;margin:auto;background-color:#ADD8E6;font-size:30px;padding:0 10px;width: 110px;">
                ${randomData}
            </div>
            <p>If you did not request a new password, please let us know immediately by replying to this email.</p>
        
            <strong>- The Rose Gold team</strong>
            </div>
            `;
            const sendEmail = await emailHandler.emailUser(emailAddress, "Password Recovery - Rose Gold Gardens", text);
            userLogger.info(`Began the password reset process for user ${emailAddress}`);

            const responseForClient:ResponseForClient<string> = {data: randomData, error: [], newToken: ''};
            // now return the code to the app so that it knows what the correct code is
            return res.status(200).json(responseForClient);
        } else {
            const responseForClient:ResponseForClient<string> = {data: '', error: ['Could not find that account information in our servers.'], newToken:''};
            userLogger.info(`couldn't find data on this attempted account: ${emailAddress}`);
            // now return the code to the app so that it knows what the correct code is
            return res.status(404).json(responseForClient);
        }
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`tried fetching user email from database: ${error}`);
            const responseForClient:ResponseForClient<string> = {data:'', error: ['There was a problem fetching your info from the database. Try again later.'], newToken: ''};
            return res.status(500).json(responseForClient);
        } else {
            userLogger.error(`there was a problem on our end: ${error}`);
            console.log(error);
            const responseForClient:ResponseForClient<string> = {data:'', error: ['There was a problem on our end. Try again later.'], newToken: ''};
            return res.status(500).json(responseForClient);
        }
    }
});

router.post('/check-sec-code', async (req:Request, res:Response) => {
    const {emailAddress, securityCode} = req.body;
    if (!emailAddress || !securityCode) return res.status(403);

    try {
        // look up the security code in the database
        const user: PasswordRecorvery = (await userOps.findUserBySecurityCode(securityCode as string)).rows[0];
        if (typeof user != "undefined" && user.security_code === securityCode && emailAddress === user.email) {
            return res.status(200).json('no good');
        } else {
            userLogger.info('attempted to find a non existent security code for: ' + emailAddress);
            return res.status(404).json('no good');
        }
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`Tried to find a user for the code ${securityCode}. Error ${error.code}: ${error.detail}`);
        } else {
            userLogger.error(`Tried to find a user for the code ${securityCode}. Error: ${error}`);
        }
        return res.status(500).json('an error occurred');
    }
})

router.post('/forgot-password-reset', async (req:Request, res:Response) => {
    const {securityCode, newPassword} = req.body;

    if (!securityCode) return res.status(404).json('cant find it');
    
    try {
        // look up the security code in the database
        const user: PasswordRecorvery = (await userOps.findUserBySecurityCode(securityCode as string)).rows[0];

        if (typeof user !== 'undefined' && user.email) {
            // hash their new password
            const pwHash: string = hashMe(newPassword);

            // now insert it into the database
            const userUpdated = await userOps.updateUserPassword(user.email, pwHash);
            userLogger.info(`user ${user.email} has updated their password.`);

            // now delete the user out of the temp database
            const userRemoved = await userOps.deleteFromPWRecovery(user.email);

            if (userRemoved.rowCount) {
                userLogger.info(`removed ${user.email} from the password recovery table`);
            }

            // email the user that their password has changed
            //const emailResultObj = (await userOps.getEmailByUsername(user.username)).rows[0];
            const text = "Your RoseGold Market account password has been updated in our system. If you didn't make this change please contact us immediately.";
            const emailSent = await emailHandler.emailUser(user.email, "Password Updated", text);

            return res.status(200).json('good');
        } else {
            return res.status(404).json('not found');
        }
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`Tried to find a user for the code ${securityCode}. Error ${error.code}: ${error.detail}`);
        } else {
            userLogger.error(`Tried to find a user for the code ${securityCode}. Error: ${error}`);
        }
        return res.sendStatus(500);
    }
});

router.post(
    '/change-address', 
    [
        authenticateJWT, check('newAddress').exists().notEmpty().isString(), check('newCity').exists().notEmpty().isString(),
        check('newZip').exists().notEmpty(), check('newState').exists().notEmpty().isString(), check('newGeolocation').exists().notEmpty().isString()
    ], async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');

    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        userLogger.error(`error during login validation: ${validationErrors}`);
        return res.status(422).json({errors: validationErrors.array()});
    }

    // grab the user's new data
    const { newAddress, newCity, newZip, newState, newGeolocation } = req.body;
    const newFullAddress = `${newAddress as string} ${newCity as string} ${newState as string}`;

    try {
        // update the database with the new info
        await userOps.updateUserAddress(newFullAddress, newZip as number, newGeolocation as string, req.user.accountId);

        // update all of the user's items as well
        await userOps.updateUserItemsLocation(newGeolocation as string, req.user.accountId);

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

router.post('/change-avatar', [authenticateJWT, upload.single("avatar")], async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    try {
        let avatarImage = req.file as Express.Multer.File;
        if (avatarImage.mimetype !== 'image/jpg' && avatarImage.mimetype !== 'image/jpeg') {
            throw new Error('Only jpg images are allowed');
        }
        
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
});

router.post('/email-support', async (req:Request, res:Response) => {
    
});
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

router.delete('/delete-user', authenticateJWT, async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    try {
        await userOps.deleteUser(req.user.accountId);

        // now delete the user's images
        await FileSystemFunctions.deleteUserAvatar(req.user.username);
        await FileSystemFunctions.deleteUserItemsDir(req.user.username);

        userLogger.info(`user deleted account: ${req.user.username}`);
        // let emailConf = await emailHa
        return res.status(200).json();
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`Problem occurred when trying to delete ${req.user.username}.\n${error.code} ${error}`);
        } else {
            userLogger.error(`Problem occrred when trying to delete ${req.user.username}.\n${error}`);
        }

        return res.status(500).json()
    }
});

router.get('/user-geolocation', authenticateJWT, async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('not authorized');

    try {
        // grab the user's geolocation from the database
        const geolocation:{x:number, y:number} = (await userOps.getUserGeolocation(req.user.accountId)).rows[0].geolocation;

        const geolocationString:string = `(${geolocation.x},${geolocation.y})`;
        console.log({geolocationString});
        const dataForClient:ResponseForClient<string> = {data:geolocationString, error:[]};

        if (res.locals.newAccessToken) {
            dataForClient.newToken = res.locals.newAccessToken;
        }

        

        return res.status(200).json(dataForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            userLogger.error(`tried to get user ${req.user.accountId}'s geolocation: ${error.code} ${error.detail}`);
        } else {
            userLogger.error(`tried to get user ${req.user.accountId}'s geolocation: ${error}`);
        }
        return res.status(500).json('error occurred');
    }
});

export default router;