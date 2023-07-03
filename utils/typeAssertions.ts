import { PostgresError } from "../models/databaseObjects.js";
import { ChatWithUsername } from "../models/dtos.js";
import { JWTError } from "../models/errors.js";

export function isJWTError(err: any): err is JWTError {
    return (err as JWTError).name !== undefined && (err as JWTError).message !== undefined;
}

export function isPostgresError(err: any): err is PostgresError {
    return (err as PostgresError).detail !== undefined;
}

export function isChatObjectWithUsername(obj: any): obj is ChatWithUsername {
    return (obj as ChatWithUsername).senderUsername !== undefined;
}