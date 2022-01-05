import jwt from 'jsonwebtoken';

/** use jwt library to create the access and refresh tokens for the client.
 * @param username the username to attach to the token via signing
*/
export function generateTokens(username: string): {accessToken: string, refreshToken: string} {
    // Generate an access & refresh token
    const accessToken: string = jwt.sign({ username: username }, process.env.ACCESSTOKENSECRET!, { expiresIn: "1h" });
    const refreshToken: string = jwt.sign({ username: username }, process.env.REFRESHTOKENSECRET!, { expiresIn: "7h" });
    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken };
}