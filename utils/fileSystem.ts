import fs from 'fs';
import { __dirname } from '../app.js';
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

    export const deleteItemImages = async () =>{

    }
}