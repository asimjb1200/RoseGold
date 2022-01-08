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
}

export type ItemPagination = {
    totalRecords: number;
    records: Item[];
}

declare global {
    namespace Express {
        interface Request {
            user?: JWTUser; // let the compiler know that it can expect to find a property named 'user' in the Request object
        }
    }
}