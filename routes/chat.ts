import express, { Request, Response } from 'express';
import { socketIO } from '../bin/www.js';
//import { socketIO } from '../bin/www.js';
import { chatOps, userOps } from '../database/databaseOperations.js';
import { chatLogger } from '../loggers/logger.js';
import { Chat, ChatEvents, isPostgresError } from '../models/databaseObjects.js';
import { GroupedChats, ChatWithUsername, ResponseForClient } from '../models/dtos.js';

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

export default router;