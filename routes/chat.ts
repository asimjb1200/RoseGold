import express, { Request, Response } from 'express';
import { chatOps, userOps } from '../database/databaseOperations.js';
import { chatLogger } from '../loggers/logger.js';
import { Chat, UnreadMessage, isPostgresError } from '../models/databaseObjects.js';
import { GroupedChats, ChatWithUsername, ResponseForClient, UsernameAndId, ChatPreview } from '../models/dtos.js';
import { hashMe } from '../security/hashing/hashStuff.js';

let router = express.Router();

router.get('/chat-history', async (req:Request, res:Response) => {
    if (!req.query.accountId) return res.status(400).json('missing data in request');

    let accountId = Number(req.query.accountId as string);

    try {
        // pull up the chat history for this user
        const chatHistory:ChatWithUsername[] = await chatOps.getAllChatsForMsgs(accountId);
        
        // now group the messages into an object with the receiver id as the keys
        // TODO: limit the amount of chats that are returned. figure out how to handle the cases when a user has a lot of chats
        
        /**holds every conversation between the different users that the requesting user has interacted with. Conversations are grouped by the account id's of the 
         * receiving users
         */
        const convoHolder:GroupedChats = chatHistory.reduce((accumulator: GroupedChats, currentChat: ChatWithUsername) => {
            // check to see if the recevier's key already exists (it's a number but node converts nums -> strings in object keys)
            if (accumulator.hasOwnProperty(currentChat.recid) && currentChat.recid != accountId) {
                accumulator[currentChat.recid].push(currentChat);
            } else if (currentChat.recid == accountId){
                // if the current receiver id is the account id I am currently working with, add that chat to the rec id if it already exists, if not create it
                if (accumulator.hasOwnProperty(currentChat.senderid)) {
                    accumulator[currentChat.senderid].push(currentChat);
                } else {
                    accumulator[currentChat.senderid] = [];
                    accumulator[currentChat.senderid].push(currentChat);
                }
            } else {
                accumulator[currentChat.recid] = [];
                accumulator[currentChat.recid].push(currentChat);
            }

            return accumulator;
        }, {});

        const dataForClient: ResponseForClient<GroupedChats> = {data: convoHolder, error: []};
        if (res.locals.newAccessToken) {
            dataForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(200).json(dataForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            chatLogger.error(`A problem occurred while fetching chats for user ${accountId} from the database code: ${error.code} details: ${error.detail}`);
            return res.status(500).json('problem');
        } else {
            chatLogger.error(`Something went wrong whiile trying to get chats and it wasn't Postgres: ${JSON.stringify(error)}`);
            return res.status(500).json('problem');
        }
    }
});

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

function checkForMatches(latestChatForEachConvo: Chat[], senderAccount:number, receiverAccount:number) {
    let matchFound = false;
    for (let conversation of latestChatForEachConvo) {
        if (
            (conversation.recid === senderAccount && conversation.senderid === receiverAccount)
            || (conversation.senderid === senderAccount && conversation.recid === receiverAccount)
        ) {
            matchFound = true;
            break;
        }
    };
    return matchFound;
}

function hasUniqueAccountsCombo(conversation: Chat, senderAccount: number, receiverAccount: number) {
    if (
        (conversation.recid === senderAccount && conversation.senderid === receiverAccount)
        || (conversation.senderid === senderAccount && conversation.recid === receiverAccount)
    ) {
        return false;
    } else {
        return true;
    }
}

export default router;