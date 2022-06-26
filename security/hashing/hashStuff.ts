import { createHash, Hash } from "crypto";

export function hashMe(textToHash:string): string {
    const hashObj: Hash = createHash('sha256');
    hashObj.update(textToHash);
    return hashObj.digest('hex');
}