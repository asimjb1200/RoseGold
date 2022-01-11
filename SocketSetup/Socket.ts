import { Server } from "http";
import { Socket, Server as SocketServer } from "socket.io";
import { chatOps } from "../database/databaseOperations.js";
import { Chat, ChatEvents } from "../models/databaseObjects.js";
import { PrivateMessage, SocketMsgForClient } from "../models/dtos";

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
                }
            });

            // socket listening for private messages between two users
            socket.on("private message", (privateMessage: Chat) => {
                this.emitEvent<Chat>(privateMessage.recid, ChatEvents.PrivateMessage, privateMessage);
                chatOps.addMsg(privateMessage);
            });
        });
    }

    public static GetInstance(server: Server){
        return this._instance || (this._instance = new this(server));
    }

    public emitEvent<T>(to: number, event: ChatEvents, data: T) {
        if (this.allSocketConnections[to]) {
            let dataForClient: SocketMsgForClient<T> = {data};
            this.allSocketConnections[to].emit(event, dataForClient);
        }
    }

    /** fetch the full chat history between two users */
    async fetchChatHistoryBetweenUsers(senderAccountId: number, receiverAccountId: number) {
        const chatLog: Chat[] = await chatOps.getChatHistoryBetweenUsers(senderAccountId, receiverAccountId);
    }
}