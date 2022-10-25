import { Account, Point, UnverifiedAccount } from "../models/databaseObjects.js";
import { TempUser } from "../models/dtos.js";
import { genSalt, hashMe } from "../security/hashing/hashStuff.js";
import { __dirname } from "../app.js";

export function buildParamList(numOfParams: number): string {
    let paramList = "";
    for (let index = 1; index <= numOfParams; index++) {
        if (index != numOfParams) {
            paramList += `$${index},`;
        } else {
            paramList += `$${index}`;
        }
    }
    return paramList;
}

/** Accepts the array and key and a returns an object with items grouped by their key */
export const groupBy = (array: any[], key: any) => {
    return array.reduce((result, currentValue) => {
      if (!result[currentValue[key]]) {
        result[currentValue[key]] = [];
      }
      result[currentValue[key]].push(currentValue);
      return result;
    }, {}); // empty object is the initial value for result object
};

/** builds an unverified user object for the database */
export function initUnverifiedAccount(userFromReq: TempUser): UnverifiedAccount {
    const salt = genSalt();
    const password = hashMe(userFromReq.password.trim());
    const avatarurl = `/images/avatars/${userFromReq.username}.jpg`;
    return {
        username: userFromReq.username.trim(),
        firstname: userFromReq.firstName.trim(),
        lastname: userFromReq.lastName.trim(),
        password,
        address: `${userFromReq.address.trim()} ${userFromReq.city.trim()} ${userFromReq.state.trim()}`,
        zipcode: +userFromReq.zipcode.trim(),
        email: userFromReq.email.trim(),
        avatarurl,
        geolocation: userFromReq.geolocation.trim(),
        phone: userFromReq.phone.trim(),
        salt
    };
}

/** builds a verified account object from an unverified account object. */
export function initVerifiedAccount(unverifiedAccount: UnverifiedAccount): Account {
    const {username, firstname, lastname, password, phone, address, zipcode, email, avatarurl, geolocation} = unverifiedAccount;
    const point = geolocation as Point;
    const geoString = `(${point.x}, ${point.y})`;
    return {
        username,
        firstname,
        lastname,
        password,
        phone,
        address,
        zipcode,
        email,
        avatarurl,
        geolocation: geoString,
        userrating: 0,
        accounttype: 1,
        refreshtoken: ''
    };
}

/** combines the salt and 2 pieces of the user's data to build the unique hash with */
export function buildHashForAccountVerification(unverifiedAccount:UnverifiedAccount, salt:string): string {
    const userInformationAndSalt:string = `${unverifiedAccount.firstname}${unverifiedAccount.phone}${salt}`;
    return hashMe(userInformationAndSalt);
}