import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { userOps } from '../../database/databaseOperations';
import { userLogger } from '../../loggers/logger.js';
import { JWTUser } from '../../models/dtos.js';

/** use jwt library to create the access and refresh tokens for the client.
 * @param username the username to attach to the token via signing
*/
export function generateTokens(username: string): {accessToken: string, refreshToken: string} {
    // Generate an access & refresh token
    const accessToken: string = jwt.sign({ username: username }, process.env.ACCESSTOKENSECRET!, { expiresIn: "1h" });
    const refreshToken: string = jwt.sign({ username: username }, process.env.REFRESHTOKENSECRET!, { expiresIn: "7h" });
    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken };
}

/** used to authenticate attempted jwt's. if the user can be decoded from the token it will allow them access. 
 * this function will also issue a new token to the user if it sees that the expiration is within 10 minutes
 */
export async function authenticateJWT(req: Request, res: Response, next: NextFunction){

    if (req.headers.authorization) {
        // grab the authorization header
        const authHeader: string = req.headers.authorization;
        // if it exists, split it on the space to get the tokem
        const token = authHeader.split(' ')[1];

        jwt.verify(token, process.env.ACCESSTOKENSECRET!, async (err: any, user: any) => {
            // if the token isn't valid, send them a forbidden code
            if (err) {
                userLogger.warn("Invalid access token attempted: " + err);
                return res.sendStatus(403);
            }
            
            const tenMinutes = 6e5;
            const currentTimestamp: number = Date.now();

            // if the token is valid, attach the user and continue the request
            req.user = user as JWTUser;

            // user's expiration time stamp is in seconds, so convert it to milliseconds first
            const timeTilInvalidation: number = (req.user.exp * 1000) - currentTimestamp;

            // check if the jwt expires within 10 minutes
            const isWithinTenMinutes: boolean = (timeTilInvalidation > 0) && (tenMinutes >= timeTilInvalidation);

            // if so, issue the user a new access token
            if (isWithinTenMinutes) {
                // first refresh the user's old token
                const newAccessTokenResponse = await refreshOldToken(req.user.username as string);
                if (typeof newAccessTokenResponse == 'number') {
                    res.sendStatus(newAccessTokenResponse);
                } else {
                    res.locals.newAccessToken = newAccessTokenResponse;
                    userLogger.info(`New access token issued for ${req.user.username}`);
                    next();
                }
            } else {
                next();
            }
        });
    } else {
        // if no auth header, show an unauthorized code
        userLogger.error("Unauthorized access attempted. No auth header present");
        res.sendStatus(401);
    }
};

/** This function takes in the user's refresh token, verifies it and then issues a new access token to them */
export async function refreshOldToken(username: string): Promise<string | number> {
    try {
        // find the user's refresh token in the database
        const refresh_token = await userOps.findRefreshTokenByUser(username);
        if (!refresh_token) {
            return 403
        }
        // keep it this way, if their refresh token has expired they'll just have to login again and create a new one
        const user: any = jwt.verify(refresh_token, process.env.REFRESHTOKENSECRET!);
        const newAccessToken = jwt.sign({ username: user.username }, process.env.ACCESSTOKENSECRET!, { expiresIn: '1h' });
    
        return newAccessToken
    } catch (dbError) {
        return 403 // this could arise if the token is no longer valid, in the case the user needs to login again
    }
}