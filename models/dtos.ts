import { Item } from "./databaseObjects.js";

export type TempUser = {
    firstName: string;
    lastName: string;
    email: string; 
    username: string; 
    password: string; 
    avatarUrl: string; 
    address: string; 
    city: string; 
    state: string;
    zipcode: string;
    geolocation: string;
    phone: string;
};

export type ItemFromClient = {
    itemId?:string;
    dateposted: string;
    name: string;
    pickedup: string;
    description: string;
    accountid: string;
    zipcode: string;
    isavailable: string;
    categoryIds: string;
}

export type ResponseForClient<T> = {
    data: T;
    error: any[];
    newToken?: string;
};

export type LoginOperationResponse = {
    accessToken: string;
    userLoggedIn: boolean;
    updateError: boolean;
    accountId?:number;
};

export type UserForClient = {
    username:string;
    accountId:number;
    accessToken:string;
    avatarUrl:string;
}

export type JWTUser = {
    username: string;
    iat: number;
    exp: number;
    accountId: number;
}

export type ItemPagination = {
    totalRecords: number;
    records: Item[];
}

export type SocketMsgForClient<T> = {
    data: T
}

export type PrivateMessage = {
    timestamp: string;
    content: string;
    senderAccountId: number;
    receiverAccountId: number; 
}

export type FilteredItemResult = {
    id: number;
    owner: number;
    name: string;
    description: string;
    image1: string;
    image2: string;
    image3: string;
    category: string;
    isavailable: boolean;
    pickedup: boolean;
    dateposted: Date;
    ownerUsername: string;
}

export type FilterQueryParams = {
    zipcodes: number[];
    categories: number[];
    limit: number;
    offset: number;
    longAndLat: string;
    miles: number;
    searchTerm: string
}

export type GroupedItems = {
    [id: string]: FilteredItemResult[];
}

export type GroupedChats = {
    [accountId: string]: ChatWithUsername[]
}

export type ItemDataForClient = {
    id: number;
    name: string;
    description: string;
    owner: number;
    isavailable: boolean;
    pickedup: boolean;
    dateposted: Date;
    categories: string[];
    image1: string;
    image2: string;
    image3: string;
    ownerUsername?: string;
}

export type ChatWithUsername = {
    id: string;
    senderid: number;
    recid:number;
    message:string;
    timestamp:string;
    senderUsername:string;
    receiverUsername: string;
}

export type ItemNameAndId = {
    id:number;
    name:string;
}

export type UserTokens = {
    accessToken: string;
    refreshToken: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: JWTUser; // let the compiler know that it can expect to find a property named 'user' in the Request object
        }
    }
}