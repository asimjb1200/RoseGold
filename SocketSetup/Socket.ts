import { Server } from "http";
import { Socket, Server as SocketServer } from "socket.io";
import { chatOps, userOps } from "../database/databaseOperations.js";
import { chatLogger } from "../loggers/logger.js";
import { Chat, ChatEvents, UnreadMessage, isPostgresError } from "../models/databaseObjects.js";
import { ChatWithUsername, SocketMsgForClient } from "../models/dtos";

export class SocketSetup {
    socketIo: SocketServer;
    private static _instance: SocketSetup;
    private allSocketConnections: {[id: number]: Socket} = {};
    
    private constructor(server: Server) {
        this.socketIo = new SocketServer(server);
        this.socketIo.on("connection", (socket: Socket) => {
            console.log("User connected");

            this.allSocketConnections[socket.handshake.auth.accountId as number] = socket;

            socket.on("disconnect me", (accountId: number) => {
                if (this.allSocketConnections[accountId]) {
                    delete this.allSocketConnections[accountId];
                    console.log("socket disconnected");
                }
            });

            socket.on("Private Message", async (privateMessageString: string) => {
                // client sends the chat object over as a string, must decode
                let privateMessage:Chat = JSON.parse(privateMessageString);

                try {
                    let chatData = await chatOps.addMsg(privateMessage);
    
                    // grab the username of the sender and receiver and attach it to the chat object
                    const senderUsername = await userOps.getUsername(chatData.senderid);
                    const receiverUsername = await userOps.getUsername(chatData.recid);
                    const chatForClient:ChatWithUsername = {id: chatData.id, message: chatData.message, senderUsername, receiverUsername, senderid:chatData.senderid, recid:chatData.recid, timestamp:chatData.timestamp}
                    
                    // build unread message block just in case the socket isn't connected
                    const unreadMessage: UnreadMessage = {message_id: chatData.id, senderid: chatData.senderid, recid: chatData.recid};
                    this.emitEvent<ChatWithUsername>(privateMessage.recid, ChatEvents.PrivateMessage, chatForClient, unreadMessage);
                } catch(err) {
                    if (isPostgresError(err)) {
                        console.log(err)
                        chatLogger.error(`An error occurred when trying to save a new chat message. Code: ${err.code} Details: ${err.detail}`);
                    } else {
                        chatLogger.error(`An error occurred when trying to save a new chat message: ${err}`);
                        console.log(err)
                    }
                }
            });
        });
    }

    public static GetInstance(server: Server){
        return this._instance || (this._instance = new this(server));
    }

    public async emitEvent<T>(to: number, event: ChatEvents, data: T, unreadMessage: UnreadMessage) {
        if (this.allSocketConnections[to]) {
            let dataForClient: SocketMsgForClient<T> = {data};
            this.allSocketConnections[to].emit(event, dataForClient);
        } else {
            console.log("couldn't find that socket, so sending to unread messages table");
            await chatOps.addMessageToUnreadQueue(unreadMessage);
        }
    }
}