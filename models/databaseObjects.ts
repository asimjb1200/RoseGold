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
    username: string;
    accounttype: boolean;
    email: string;
    password: string;
    avatarurl: string;
    userrating: number;
    address: string;
    zipcode: number;
    refreshtoken: string;
};

export type Chat = {
    id?: number;
    senderid: number;
    recid: number;
    message: string;
    timestamp: string;
}

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

export function isPostgresError(err: any): err is PostgresError {
    return (err as PostgresError).detail !== undefined;
}