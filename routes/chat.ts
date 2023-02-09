import express, { Request, Response } from 'express';
import { chatOps, userOps } from '../database/databaseOperations.js';
import { chatLogger } from '../loggers/logger.js';
import { Chat, isPostgresError } from '../models/databaseObjects.js';
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
    // get the id of the user sending the request (the viewer)
    try {
        let viewingAccount = Number(req.query.accountId as string);

        // check database for any chat they're in
        let chatHistory: Chat[] = await chatOps.fetchChatHistory(viewingAccount);
        let latestChatForEachConvo: Chat[] = [];
        
        // the chats are in descending order, so the newest ones are at the front
        for (let x = 0; x < chatHistory.length; x++) {
            const currentChat: Chat = chatHistory[x];
            
            if (x === 0) {
                latestChatForEachConvo.push(chatHistory[x]);
            } else {
                if (checkForMatches(latestChatForEachConvo, currentChat.senderid, currentChat.recid) === false) {
                    latestChatForEachConvo.push(chatHistory[x]);
                }
            }        
        }

        const receivingUsers: number[] = latestChatForEachConvo.map(x => {
            if (x.recid === viewingAccount) {
                return x.senderid;
            } else {
                return x.recid;
            }
        });

        // fetch the usernames for each of these id's
        const usernamesAndIds: UsernameAndId[] = await userOps.getUsernameAndId(receivingUsers);

        const latestChatPreviews: ChatPreview[] = latestChatForEachConvo.map(chat => {
            const userToFind: number = chat.recid === viewingAccount ? chat.senderid : chat.recid;
            const nonViewingUsersUsername: string = usernamesAndIds.find(x => x.accountid === userToFind)!.username;
            const chatPreview: ChatPreview = {
                id: chat.id,
                nonViewingUsersUsername,
                recid: chat.recid,
                senderid: chat.senderid,
                message: chat.message,
                timestamp: chat.timestamp
            }
            return chatPreview;
        });
    
        return res.status(200).json(latestChatPreviews);
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
    try {
        const viewingAccount = Number(req.query.viewingAccount);
        const otherUserAccount = Number(req.query.otherUserAccount);

        // get the chat history between these two users
        const chatThread:ChatWithUsername[] = await chatOps.getChatHistoryBetweenUsers(viewingAccount, otherUserAccount);

        return res.status(200).json(chatThread);
    } catch (error) {
        console.log(error);
        return res.sendStatus(500);
    }
});

router.get('/get-username', async (req:Request, res: Response) => {
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

function checkForMatches(latestChatForEachConvo: Chat[], senderAccount:number, receiverAccount:number) {
    let matchFound = false;
    for (let conversation of latestChatForEachConvo) {
        if (
            (conversation.recid === senderAccount && conversation.senderid === receiverAccount)
            || (conversation.senderid === senderAccount && conversation.recid === receiverAccount)
            || (conversation.recid === receiverAccount && conversation.senderid === senderAccount)
            || (conversation.senderid === receiverAccount && conversation.recid === senderAccount)
        ) {
            matchFound = true;
            break
        }
    };
    return matchFound;
}

function hasUniqueAccountsCombo(conversation: Chat, senderAccount: number, receiverAccount: number) {
    if (
        (conversation.recid === senderAccount && conversation.senderid === receiverAccount)
        || (conversation.senderid === senderAccount && conversation.recid === receiverAccount)
        || (conversation.recid === receiverAccount && conversation.senderid === senderAccount)
        || (conversation.senderid === receiverAccount && conversation.recid === senderAccount)
    ) {
        return false;
    } else {
        return true;
    }
}

export default router;