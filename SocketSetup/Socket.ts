import { Server } from "http";
import { Socket, Server as SocketServer } from "socket.io";
import { chatOps, userOps } from "../database/databaseOperations.js";
import { chatLogger } from "../loggers/logger.js";
import { Chat, ChatEvents, DeviceToken, UnreadMessage } from "../models/databaseObjects.js";
import { ChatWithUsername, SocketMsgForClient } from "../models/dtos";
import * as TokenFunctions from "../security/tokens/tokens.js";
import * as APNFunctions from "../APN/APNService.js";
import { isPostgresError, isChatObjectWithUsername } from "../utils/typeAssertions.js";

export class SocketSetup {
    socketIo: SocketServer;
    private static _instance: SocketSetup;
    private allSocketConnections: {[id: string]: Socket} = {};
    private apnJWT: string = '';

    private constructor(server: Server) {
        this.socketIo = new SocketServer(server);
        this.socketIo.on("connection", (socket: Socket) => {

            this.allSocketConnections[socket.handshake.auth.accountId] = socket;

            socket.on("disconnect me", (accountId: number) => {
                if (this.allSocketConnections[accountId]) {
                    delete this.allSocketConnections[accountId];
                }
            });

            socket.on("Private Message", async (privateMessageString: string) => {
                try {
                    // client sends the chat object over as a string, must decode
                    let privateMessage:Chat = JSON.parse(privateMessageString);
                    let chatData = await chatOps.addMsg(privateMessage);
                    await this.sendPrivateMessage(chatData);
                } catch(err) {
                    if (isPostgresError(err)) {
                        console.log(err)
                        chatLogger.error(`An error occurred when trying to save a new chat message. Code: ${err.code} Details: ${err.detail}`);
                    } else {
                        chatLogger.error(`An error occurred when trying to save and send a new chat message: ${err}`);
                        console.log(err);
                    }
                }
            });
        });
    }

    private async sendPrivateMessage(chatData: Chat) {
        // grab the username of the sender and receiver and attach it to the chat object

        // TODO: Find a better way to do this
        const senderUsername = await userOps.getUsername(chatData.senderid);
        const receiverUsername = await userOps.getUsername(chatData.recid);

        const chatForClient: ChatWithUsername = { id: chatData.id, message: chatData.message, senderUsername, receiverUsername, senderid: chatData.senderid, recid: chatData.recid, timestamp: chatData.timestamp };

        // build unread message block just in case the socket isn't connected
        const unreadMessage: UnreadMessage = { message_id: chatData.id, senderid: chatData.senderid, recid: chatData.recid };
        await this.emitEvent<ChatWithUsername>(chatData.recid, ChatEvents.PrivateMessage, chatForClient, unreadMessage);
    }

    public static GetInstance(server: Server){
        return this._instance || (this._instance = new this(server));
    }

    private async emitEvent<T>(to: number, event: ChatEvents, data: T, unreadMessage: UnreadMessage) {
        if (this.allSocketConnections[to]) {
            let dataForClient: SocketMsgForClient<T> = {data};
            this.allSocketConnections[to].emit(event, dataForClient);
        } else {
            //console.log("no socket found")
            try {
                await chatOps.addMessageToUnreadQueue(unreadMessage);
            } catch (error) {
                chatLogger.error(`[Socket] error while trying to add message to unread queue: ${error}`);
            }
            // if (isChatObjectWithUsername(data)) {
            //     await this.notifyUserViaAPN(data);
            // }
        }
    }

    // private async notifyUserViaAPN(unreadMessage: ChatWithUsername) {
    //     // check if there's a device token for the receiving user
    //     const deviceTokensForReceiver: DeviceToken[] = (await userOps.getDeviceToken(unreadMessage.recid)).rows;
    //     if (deviceTokensForReceiver.length) {
    //         // send them a notification about the new message
    //         this.apnJWT = this.apnJWT || await TokenFunctions.generateAPNToken();
    //         this.apnJWT = await TokenFunctions.checkIfTokenExpired(this.apnJWT);
    //         const apnPayload = APNFunctions.generateAPNPayload("MESSAGE", unreadMessage);
    //         deviceTokensForReceiver.forEach( deviceTokenObject => {
    //             APNFunctions.sendToAPNServer(deviceTokenObject.device_token, this.apnJWT, apnPayload);
    //         });
    //     }
    // }
}