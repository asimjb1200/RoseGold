import { createHash, Hash, randomBytes } from "crypto";

export function hashMe(textToHash:string): string {
    const hashObj: Hash = createHash('sha256');
    hashObj.update(textToHash);
    return hashObj.digest('hex');
}

/** using 16 bytes of random data */
export function genSalt() {
    return randomBytes(16).toString('hex');
}