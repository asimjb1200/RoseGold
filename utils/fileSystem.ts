import fs from 'fs';
import { __dirname } from '../app.js';
import { userLogger } from '../loggers/logger.js';

export namespace FileSystemFunctions {
    const fsPromises = fs.promises;
    export async function saveItemImages(imageBuffers: Express.Multer.File, username: string, itemName: string) {
        const path = `${__dirname}/images/${username}/${itemName}/${imageBuffers.originalname}`
        return fsPromises.writeFile(path, imageBuffers.buffer);
    }

    export async function createDirForUser(username: string, itemName: string) {
        const strippedName = itemName.trim();
        // create unique sub dir name
        return fsPromises.mkdir(`${__dirname}/images/${username}/${strippedName}`, {recursive: true});
    }

    export async function getImagesFilePathForItem(username:string, itemName:string): Promise<string[]> {
        const path = `${__dirname}/images/${username}/${itemName}`;
        const filenames: string[] = await fsPromises.readdir(path);
        const fullFilepathsToImages: string[] = filenames.map(file => { return `${path}/${file}`});
        return fullFilepathsToImages;
    }

    export async function loadItemImages(username: string, itemname: string): Promise<Buffer[]> {
        const path = `${__dirname}/images/${username}/${itemname}/`;
        const filenames: string[] = await fsPromises.readdir(path);
        //let files: {[id: string]: Buffer};
        let files: Buffer[] = [];

        for (const file of filenames) {
            const fileData = await fsPromises.readFile(`${path}/${file}`)
            files.push(fileData);
        }

        return files;
    }

    /** use this one to delete the entire dir that for the item */
    export const deleteItemImages = async (username:string, itemName:string) =>{
        const path = `${__dirname}/images/${username}/${itemName}/`;

        fs.rm(path, {recursive:true, force:true}, () => {userLogger.info(`deleted photos for ${username}'s ${itemName} item`)});
    }

    /** use this method to delete all of the user's item's images */
    export const deleteUserItemsDir = async (username: string) => {
        const path = `${__dirname}/images/${username}/`;
        fs.rm(path, {recursive:true, force:true}, () => { userLogger.info(`deleted item photos for ${username}`) } );
    }

    /**
     * use this method to delete the user's avatar image
     * @param username - the name of the user to save the avatar for
     */
    export const deleteUserAvatar = async (username: string) => {
        const path = `${__dirname}/images/avatars/${username}.jpg`;
        fs.rm(path, () => {userLogger.info(`deleted ${username} profile image.`)});
    }


    /** save the user's avatar image into the avatar directory.
     * @param filename - the file to save. the name of the file should be the user's username. 
     * This method will overwrite the file if it already exists.
     */
    export async function saveAvatarImage(data: Express.Multer.File) {
        const path = `${__dirname}/images/avatars/${data.originalname}`;
        if (fs.existsSync(`${__dirname}/images/avatars`)) {
            return fsPromises.writeFile(path, data.buffer);
        } else {
            await fsPromises.mkdir(`${__dirname}/images/avatars`, {recursive: true});
            return fsPromises.writeFile(path, data.buffer);
        }
    }
}