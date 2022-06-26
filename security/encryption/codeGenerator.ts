import crypto from 'crypto';
import { promisify } from 'util';

/** used to generate a random alphanumeric string */
export function generateRandomCode(byteSizeOfString:number) {
    let randomBytesPromise = promisify(crypto.randomBytes);
    return randomBytesPromise(byteSizeOfString);
} 