import { Item } from "./databaseObjects.js";

export type TempUser = {
    email: string; 
    username: string; 
    password: string; 
    avatarUrl: string; 
    address: string; 
    city: string; 
    state: string;
    zipcode: number;
};

export type ResponseForClient<T> = {
    data: T;
    error: any[];
    newToken?: string;
};

export type LoginOperationResponse = {
    accessToken: string;
    userLoggedIn: boolean;
    updateError: boolean;
};

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
    category: string;
    isavailable: boolean;
    pickedup: boolean;
    dateposted: Date;
}

export type FilterQueryParams = {
    zipcodes: number[];
    categories: number[];
    limit: number;
    offset: number;
    longAndLat: string;
    miles: number;
}

export type GroupedItems = {
    [id: string]: FilteredItemResult[];
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
}

declare global {
    namespace Express {
        interface Request {
            user?: JWTUser; // let the compiler know that it can expect to find a property named 'user' in the Request object
        }
    }
}