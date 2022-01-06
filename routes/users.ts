import express from "express";
import { Request, Response } from "express";
import {body, check, Result, validationResult} from "express-validator";
import { userOps } from "../database/databaseOperations.js";
import { userLogger } from "../loggers/logger.js";
import { Account, isPostgresError } from "../models/databaseObjects.js";
import { LoginOperationResponse, ResponseForClient, TempUser } from "../models/dtos.js";
import {createHash, Hash} from 'crypto';
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

export default router;