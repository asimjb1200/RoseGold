import express, { Request, Response } from 'express';
import { chatOps, userOps } from '../database/databaseOperations.js';
import { chatLogger } from '../loggers/logger.js';
import { Chat, UnreadMessage, isPostgresError } from '../models/databaseObjects.js';
import { GroupedChats, ChatWithUsername, ResponseForClient, UsernameAndId, ChatPreview } from '../models/dtos.js';
import { hashMe } from '../security/hashing/hashStuff.js';

let router = express.Router();

/*
    this endpoint is for loading the user's last message for each chat that
    they are in.
    This is going to allow me to populate their message tab in the application with
    the last chat in each conversation they're in
**/
router.get('/latest-messages', async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    // get the id of the user sending the request (the viewer)
    try {
        let viewingAccount = Number(req.query.accountId as string);

        // check database for any chat they're in
        let latestChatForEachConvo: ChatPreview[] = (await chatOps.fetchLatestChatInEachThread(viewingAccount)).rows;

        // make sure that chat data is returned
        if (latestChatForEachConvo.length > 0) {
            const dataForClient:ResponseForClient<ChatPreview[]> = {data: latestChatForEachConvo, error: []};
            if (res.locals.newAccessToken) {
                dataForClient.newToken = res.locals.newAccessToken;
            }
            return res.status(200).json(dataForClient);
        } else {
            const dataForClient:ResponseForClient<ChatPreview[]> = {data: [], error: []};
            if (res.locals.newAccessToken) {
                dataForClient.newToken = res.locals.newAccessToken;
            }
            return res.status(200).json(dataForClient);
        }
    } catch (error) {
        if (isPostgresError(error)) {
            chatLogger.error(`database error during the fetching of latest messages: ${error}`);
        } else {
            chatLogger.error(`error occurred during the fetching of latest messages: ${error}`);
        }
        return res.sendStatus(500);
    }
});

router.get('/get-chat-thread', async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    try {
        const viewingAccount = Number(req.query.viewingAccount);
        const otherUserAccount = Number(req.query.otherUserAccount);

        // get the chat history between these two users
        const chatThread:ChatWithUsername[] = await chatOps.getChatHistoryBetweenUsers(viewingAccount, otherUserAccount);

        const dataForClient:ResponseForClient<ChatWithUsername[]> = {data:chatThread, error: []};
        if (res.locals.newAccessToken) {
            dataForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(200).json(dataForClient);
    } catch (error) {
        console.log(error);
        return res.sendStatus(500);
    }
});

router.get('/get-username', async (req:Request, res: Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    try {
        const accountId: number = Number(req.query.accountId as string);

        // get the username associated with this account id
        const username = await userOps.getUsername(accountId);
    
        return res.status(200).json(username);
    } catch (error) {
        console.log(error);
        return res.sendStatus(500);
    }
});

router.get('/get-unread-messages', async (req:Request, res: Response) => {
    if (!req.user) return res.status(403).json('unauthorized');

    try {
        // get all of a user's unread messages
        const unreadMessages:UnreadMessage[] = (await chatOps.getUnreadMessagesForUser(req.user.accountId)).rows;

        const responseForClient: ResponseForClient<UnreadMessage[]> = {data: unreadMessages, error: []};

        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }

        return res.status(200).json(responseForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            chatLogger.error(`database error ${error.code} during the fetching of unread messages: ${error.detail}`);
        } else {
            chatLogger.error(`error occurred during the fetching of latest messages: ${error}`);
        }
        return res.sendStatus(500);
    }
});

router.delete('/delete-from-unread',async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');

    try {
        const {senderId} = req.body;

        // delete the messages from the unread table between the user and another user
        await chatOps.deleteMessagesFromUnreadTable(req.user.accountId, senderId);

        const responseForClient: ResponseForClient<boolean> = {data: true, error: []};

        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }

        return res.status(200).json(responseForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            chatLogger.error(`database error ${error.code} during the deletion of unread messages: ${error.detail}`);
        } else {
            chatLogger.error(`error occurred during the deletion of unread messages: ${error}`);
        }
        return res.sendStatus(500);
    }
});

export default router;