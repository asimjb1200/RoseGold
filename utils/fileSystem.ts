import fs from 'fs';
import { __dirname } from '../app.js';
import { userLogger } from '../loggers/logger.js';
//const __dirname = process.cwd();

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

    /** creates a directory for the user's avatar image. strips the name in case of line breaking chars */
    export async function createAvatarDirForUser(username:string) {
        const strippedName = username.trim();
        return fsPromises.mkdir(`${__dirname}/images/avatars/${strippedName}`, {recursive: true});
    }

    /** save the user's avatar image into the avatar directory.
     * @param filename - the file to save. the name of the file should be the user's username. 
     * This method will overwrite the file if it already exists.
     */
    export async function saveAvatarImage(data: Express.Multer.File) {
        const path = `${__dirname}/images/avatars/${data.originalname}`;
        return fsPromises.writeFile(path, data.buffer);
    }
}