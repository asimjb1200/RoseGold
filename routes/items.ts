import express, { Request, Response } from 'express';
import multer from 'multer';
import { check, validationResult } from 'express-validator';
import { itemOps } from '../database/databaseOperations.js';
import { itemLogger } from '../loggers/logger.js';
import { isPostgresError, Item } from '../models/databaseObjects.js';
import { FilteredItemResult, FilterQueryParams, GroupedItems, ItemDataForClient, ItemFromClient, ResponseForClient } from '../models/dtos.js';
import { FileSystemFunctions } from '../utils/fileSystem.js';
import { groupBy } from '../utils/utils.js';
import validator from 'validator';

let router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/add-items', upload.array('images'), async (req: Request, res: Response) => {
    if (!req.user) return res.status(403).json('unauthorized');

    let imagesForItem: Express.Multer.File[] = req.files as Express.Multer.File[];
    
    try {
        for (let x = 0; x < imagesForItem.length; x++) {
            let currentElement:Express.Multer.File = imagesForItem[x];
            if (currentElement.mimetype !== 'image/jpg' && currentElement.mimetype !== 'image/jpeg') {
                throw new Error('Only jpg images are allowed');
            }
        }

        const itemData: ItemFromClient = req.body;
        const categoryIds: number[] = JSON.parse(itemData.categoryIds.trim());

        // remove line breaks from all elements
        const itemForDB: Item = {
            accountid: Number(itemData.accountid.trim()),
            name: itemData.name.trim(),
            description: itemData.description.trim(),
            dateposted: itemData.dateposted.trim(),
            pickedup: (String(true) == itemData.pickedup.trim()),
            isavailable: (String(true) == itemData.isavailable.trim()),
            zipcode: Number(itemData.zipcode.trim())
        };

        await FileSystemFunctions.createDirForUser(req.user.username, itemData.name);
        await Promise.all([
            FileSystemFunctions.saveItemImages(imagesForItem[0], req.user.username, itemForDB.name),
            FileSystemFunctions.saveItemImages(imagesForItem[1], req.user.username, itemForDB.name),
            FileSystemFunctions.saveItemImages(imagesForItem[2], req.user.username, itemForDB.name)
        ]);

        const imageFilePaths: string[] = await FileSystemFunctions.getImagesFilePathForItem(req.user.username, itemForDB.name);
        itemForDB.image1 = imageFilePaths[0];
        itemForDB.image2 = imageFilePaths[1];
        itemForDB.image3 = imageFilePaths[2];
        
        const idOfInsertedItem: number = (await itemOps.postItem(itemForDB)).rows[0].id;
        
        // now save the categories if the user passed them in
        const categoriesInserted = await itemOps.postItemCategories(idOfInsertedItem, categoryIds);
        const responseForClient = {data:'insert successful', error:[]} as ResponseForClient<string>;

        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        res.status(201).json(responseForClient); 
    } catch (error) {
        if (isPostgresError(error)) {
            itemLogger.error(`Tried to bulk add items. Pg code: ${error.code} Details: ${error.detail}`);
            return res.status(500).json("fail");
        } else {
            console.log(error);
            return res.status(500).json("fail");
        }
    }
});

router.post('/delete-items', check('deleteTheseIds').isArray().notEmpty(), async (req: Request, res: Response) => {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return res.status(422).json({ errors: validationErrors.array() });
    }

    const deleteTheseIds: number[] = req.body.deleteTheseIds;

    try {
        if (deleteTheseIds.length > 1) {
            const deleteComplete = await itemOps.bulkDeleteItems(deleteTheseIds);
            const responseForClient = {data:deleteComplete, error:[]} as ResponseForClient<boolean>;
            if (res.locals.newAccessToken) {
                responseForClient.newToken = res.locals.newAccessToken;
            }
            return res.status(200).json(responseForClient);
        } else {
            const deleteComplete = await itemOps.deleteItem(deleteTheseIds[0]);
            const responseForClient = {data:deleteComplete, error:[]} as ResponseForClient<boolean>;
            if (res.locals.newAccessToken) {
                responseForClient.newToken = res.locals.newAccessToken;
            }
            return res.status(200).json(responseForClient);
        }
    } catch (error) {
        if (isPostgresError(error)) {
            itemLogger.error(`Tried to delete these items: ${deleteTheseIds}. Code: ${error.code} Details: ${error.detail}`);
            return res.status(500).json()
        } else {
            itemLogger.error(`Tried to delete these items: ${deleteTheseIds}. Details: ${error}`);
            return res.status(500).json();
        }
    }
});

router.post(
    '/fetch-filtered-items',
    [
        check('categories').isArray(),
        check('limit').notEmpty().isInt({ min: 10, max: 100 }),
        check('offset').notEmpty().isInt({ min: 0 }),
        check('longAndLat').notEmpty().isString(),
        check('miles').notEmpty().isInt({ min: 10 }),
        check('searchTerm')
    ],
    async (req: Request, res: Response) => {
        if (!req.user) return res.status(403).json('unauthorized');

        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(422).json({ errors: validationErrors.array() });
        }

        const filterQueryParams: FilterQueryParams = req.body;

        let safeText: string = '';
        if (filterQueryParams.searchTerm.length) {
            const isAlpha = validator.isAlpha(filterQueryParams.searchTerm, 'en-US', {ignore: ' '});
            if (isAlpha) {
                safeText = validator.escape(validator.trim(filterQueryParams.searchTerm));
            }
        }
        
        try {
            let records: FilteredItemResult[];
            if (safeText.length) {
                records = await itemOps.fetchFilteredItems(
                    filterQueryParams.categories, filterQueryParams.limit,
                    filterQueryParams.offset, filterQueryParams.longAndLat, filterQueryParams.miles, safeText, req.user.accountId
                );
            } else {
                records = await itemOps.fetchFilteredItems(
                    filterQueryParams.categories, filterQueryParams.limit,
                    filterQueryParams.offset, filterQueryParams.longAndLat, filterQueryParams.miles, '', req.user.accountId
                );
            }

            // group the items with the same id together into arrays under their id number as the key
            const itemsGroupedById: GroupedItems = groupBy(records, "id");
            let finalItemArray: ItemDataForClient[] = [];

            // now go through each key and create a single item with all of the item's categories put into a list
            for (const itemIdKey in itemsGroupedById) {
                const itemDTOS = itemsGroupedById[itemIdKey];
                const categoryListForItem: string[] = itemDTOS.reduce((arrayOfCategories: string[], itemDTO: FilteredItemResult) => {
                    arrayOfCategories.push(itemDTO.category);
                    return arrayOfCategories;
                }, []);
                const firstItem = itemDTOS[0]; // all items under the current key are the same, so pick any one to use for grabbing info

                const item: ItemDataForClient = {
                    id: +itemIdKey, name: firstItem.name, description: firstItem.description, dateposted: firstItem.dateposted,
                    isavailable: firstItem.isavailable, pickedup: firstItem.pickedup, categories: categoryListForItem, owner: firstItem.owner,
                    image1: firstItem.image1, image2: firstItem.image2, image3: firstItem.image3, ownerUsername: firstItem.ownerUsername
                }

                finalItemArray.push(item);
            }

            if (records.length) {
                const responseForClient = { data: finalItemArray, error: [] } as ResponseForClient<ItemDataForClient[]>;
                if (res.locals.newAccessToken) {
                    responseForClient.newToken = res.locals.newAccessToken;
                }
                return res.status(200).json(responseForClient);
            } else {
                const responseForClient = { data: [], error: [] } as ResponseForClient<ItemDataForClient[]>;
                if (res.locals.newAccessToken) {
                    responseForClient.newToken = res.locals.newAccessToken;
                }
                return res.status(404).json(responseForClient);
            }
        } catch (error) {
            if (isPostgresError(error)) {
                itemLogger.error(`Tried to fetch filtered items. Code ${error.code}. Detail: ${error.detail}`);
                return res.status(503).json();
            } else {
                itemLogger.error(`Tried to fetch filtered items: ${error}`);
                return res.status(500).json();
            }
        }
    }
);

router.delete('/delete-item', async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    let itemToDelete = req.query.itemId as string;
    let itemName = req.query.itemName as string;

    try {
        // remove the items images from the database
        let itemDeleted:boolean = await itemOps.deleteItem(+itemToDelete);
        // remove item images
        await FileSystemFunctions.deleteItemImages(req.user.username, itemName);
        const responseForClient = {data:itemDeleted, error:[]} as ResponseForClient<boolean>;
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(200).json(responseForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            itemLogger.error(`Problem when trying to delete item ${itemToDelete}: ${error.code} ${error.detail}`);
        } else {
            itemLogger.error(`Problem when trying to delete item ${itemToDelete}: ${error}`);
        }
        return res.status(500).json("problem occurred when deleting");
    }
});

router.get('/item-details-for-edit', async (req:Request, res:Response) => {
    let itemId = req.query.itemId as string;

    if (!req.user) return res.status(403).json('unauthorized');

    try {
        // grab the item's info from the database
        let itemInfo:Item = (await itemOps.fetchItemData(itemId)).rows[0];

        // grab the item's categories from the data base
        let itemCategories:{description:string}[] = (await itemOps.fetchCategoriesForItem(itemId)).rows;

        // now build the item for the client to use
        const itemForClient:ItemDataForClient = {
            id: itemInfo.id!,// id will always be there in this scenario due to the prior query
            name: itemInfo.name,
            description: itemInfo.description,
            dateposted: new Date(itemInfo.dateposted),
            owner: req.user.accountId,
            isavailable: itemInfo.isavailable,
            pickedup: itemInfo.pickedup,
            ownerUsername: req.user.username,
            image1: itemInfo.image1 ?? "",
            image2: itemInfo.image2 ?? "",
            image3: itemInfo.image3 ?? "",
            categories: itemCategories.map(itemObj => itemObj.description)
        };

        const responseForClient = {data:itemForClient, error:[]} as ResponseForClient<ItemDataForClient>;
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        return res.status(200).json(responseForClient);

    } catch (error) {
        if (isPostgresError(error)) {
            itemLogger.error(`Getting details for item ${itemId}: ${error.code} ${error.detail}`);
            return res.status(500).json('db error');
        } else {

        }
    }
});

router.post('/edit-item', upload.array('images'), async (req:Request, res:Response) => {
    if (!req.user) return res.status(403).json('unauthorized');
    try {
        let imagesForItem: Express.Multer.File[] = req.files as Express.Multer.File[];

        for (let x = 0; x < imagesForItem.length; x++) {
            let currentElement:Express.Multer.File = imagesForItem[x];
            if (currentElement.mimetype !== 'image/jpg' && currentElement.mimetype !== 'image/jpeg') {
                throw new Error('Only jpg images are allowed');
            }
        }
        
        const itemData: ItemFromClient = req.body;
        //const categoryIds: number[] = JSON.parse(itemData.categoryIds.trim());
        
        const itemForDB: Item = {
            id: +itemData.itemId!.trim(),
            accountid: Number(itemData.accountid.trim()),
            name: itemData.name.trim(),
            description: itemData.description.trim(),
            dateposted: itemData.dateposted.trim(),
            pickedup: (String(true) == itemData.pickedup.trim()),
            isavailable: (String(true) == itemData.isavailable.trim()),
            zipcode: Number(itemData.zipcode.trim())
        };

        // update the item's pictures
        await Promise.all([
            FileSystemFunctions.saveItemImages(imagesForItem[0], req.user.username, itemForDB.name),
            FileSystemFunctions.saveItemImages(imagesForItem[1], req.user.username, itemForDB.name),
            FileSystemFunctions.saveItemImages(imagesForItem[2], req.user.username, itemForDB.name)
        ]);

        const imageFilePaths: string[] = await FileSystemFunctions.getImagesFilePathForItem(req.user.username, itemForDB.name);
        itemForDB.image1 = imageFilePaths[0];
        itemForDB.image2 = imageFilePaths[1];
        itemForDB.image3 = imageFilePaths[2];

        //update the item in the item table
        let itemUpdated = itemOps.updateItem(itemForDB);

        // now update the item's categories in the item_categories table
        //const categoriesInserted = await itemOps.postItemCategories(itemForDB.id!, categoryIds);
        const responseForClient = {data:'ok', error:[]} as ResponseForClient<string>;
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }

        // if all is okay, send the OK
        return res.status(201).json(responseForClient);    
    } catch (error) {
        console.log(error);
        if (isPostgresError(error)) {
            itemLogger.error(`tried to update item: ${error.code} ${error.detail}`);
        } else {
            itemLogger.error(`tried to update item: ${error}`);
        }
        return res.status(500).json('error');
    }
});

router.post('/edit-item-categories', async (req: Request, res: Response) => {
    if (!req.user) return res.status(403).json('unauthorized');

    try {
        const categoryIds: number[] = req.body.categories;
        const itemId: number = +req.body.itemId;

        await itemOps.deleteItemCategories(itemId);
        await itemOps.updateItemCategories(itemId, categoryIds);

        itemLogger.info(`user updated the categories to item ${itemId}`);

        const responseForClient = {data:true, error:[]} as ResponseForClient<boolean>;
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }

        return res.status(200).json(responseForClient);
    } catch (error) {
        if (isPostgresError(error)) {
            itemLogger.error(`there was an error when updating categories for an item: ${error}`);
        } else {
            itemLogger.error(`there was an error when updating categories for an item: ${error}`);
        }
        const responseForClient = {data:false, error:[]} as ResponseForClient<false>;
        if (res.locals.newAccessToken) {
            responseForClient.newToken = res.locals.newAccessToken;
        }
        res.status(500).json(responseForClient);
    }
});

export default router;