import { JsonWebTokenError } from "jsonwebtoken";
import { ChatWithUsername } from "./dtos";
import { JWTError } from "./errors";

export type Item = {
    id?: number;
    accountid: number;
    image1?: string;
    image2?: string;
    image3?: string;
    isavailable: boolean;
    pickedup: boolean;
    zipcode: number;
    dateposted: string;
    name: string;
    description: string;
};

export type UnreadMessage = {
    message_id: string;
    senderid: number;
    recid: number;
};

export type ItemCategories = {
    itemid: number;
    category: number;
};

export type Favorite = {
    itemid: number;
    accountid: number;
};

export type Category = {
    id: number;
    description: string;
};

export type Account = {
    accountid?: number;
    firstname: string;
    lastname: string;
    username: string;
    accounttype: number;
    email: string;
    password: string;
    avatarurl: string;
    userrating: number;
    address: string;
    zipcode: number;
    refreshtoken: string;
    geolocation: string;
    phone?: string;
};

export type UnverifiedAccount = {
    accountid?: number;
    firstname: string;
    lastname: string;
    username: string;
    email: string;
    password: string;
    avatarurl: string;
    address: string;
    zipcode: number;
    geolocation: string | Point;
    phone: string;
    salt: string;
    timestamp?: string;
};

export type Point = {
    x:number;
    y:number;
}

export type Chat = {
    id: string;
    senderid: number;
    recid: number;
    message: string;
    timestamp: string;
};

export type PasswordRecorvery = {
    email: string;
    security_code: string;
    created: string;
};

export type PostgresError = {
    length: number;
    severity?: string;
    code?: string;
    detail: string;
    hint?: any;
    position?: any;
    internalPosition?: any;
    internalQuery?: any;
    where?: any;
    schema?: string;
    table?: string;
    column?: string;
    dataType?: string;
    constraint?: string;
    file?: string;
    line?: string;
    routine?: string
}

export enum ChatEvents {
    SenderTyping = "Sender Typing",
    ReceiverTyping = "Receiver Typing",
    MsgSent = "Message Sent",
    MsgSeen = "Message Seen",
    PrivateMessage = "Private Message"
}

export type AccountDevice = {
    accountid: number;
    device_token: string;
}

export type DeviceToken = Pick<AccountDevice, "device_token">;