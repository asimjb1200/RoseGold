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
    export const deleteItemImages = async (username:string, itemName:string) => {
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

    /** use this method to rename a user's avatar image */
    export async function renameAvatarImage(newUsername:string, oldUsername:string) {
        const oldProfileImageName = `${__dirname}/images/avatars/${oldUsername}.jpg`;
        const newProfileImageName = `${__dirname}/images/avatars/${newUsername}.jpg`;

        fs.rename(oldProfileImageName, newProfileImageName, (error: NodeJS.ErrnoException | null) => {
            if (error) {
                console.log(error);
            } else {
                userLogger.info(`updated ${newUsername}'s profile picture name`);
            }
        });
    }

    /** use this method to rename the user's image directory that contains all of the images for their items */
    export async function renameItemOwnerFolder(newUsername:string, oldUsername: string) {
        const oldUserImagesHome = `${__dirname}/images/${oldUsername}`;
        const newUserImagesHome = `${__dirname}/images/${newUsername}`;

        fs.rename(oldUserImagesHome, newUserImagesHome, (error: NodeJS.ErrnoException | null) => {
            if (error) {
                console.log(error);
            } else {
                userLogger.info(`updated ${newUsername}'s home image directory`);
            }
        });
    }

    /** use this method to change the name of a specific item folder in the user's home folder. for example, if I want to change an item from 'plant one' to 'plant two' */
    export async function renameItemFolder(newItemName: string, oldItemName: string, ownerName: string) {
        const oldItemFolderPath = `${__dirname}/images/${ownerName}/${oldItemName}`;
        const newItemFolderPath = `${__dirname}/images/${ownerName}/${newItemName}`;

        fs.rename(oldItemFolderPath, newItemFolderPath, (error: NodeJS.ErrnoException | null) => {
            if (error) {
                console.log(error);
            } else {
                userLogger.info(`updated ${ownerName}'s item image directory from ${oldItemName} to ${newItemName}`);
            }
        });
    }
}