export type JWTError = {
    name: string;
    message: string;
    expiredAt: Date;
}