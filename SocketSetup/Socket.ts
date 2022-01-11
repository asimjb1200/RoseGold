import { Server } from "http";
import { Socket, Server as SocketServer } from "socket.io";
import { ChatEvents } from "../models/databaseObjects";
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
            socket.on("private message", (privateMessage: PrivateMessage) => {
                // if (this.allSocketConnections[privateMessage.receiverAccountId]) {
                //     this.allSocketConnections[privateMessage.receiverAccountId].emit(ChatEvents.PrivateMessage, privateMessage); // client will have a listener set up for this event
                //     // now save the user and their msg to the db
                // }
                this.emitEvent<PrivateMessage>(privateMessage.receiverAccountId, ChatEvents.PrivateMessage, privateMessage);
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

    public fetchChatHistoryBetweenUsers(senderAccountId: number, receiverAccountId: number) {
        
    }
}