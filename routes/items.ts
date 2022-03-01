import express, { Request, Response } from 'express';
import multer, { Multer } from 'multer';
import { check, query, validationResult } from 'express-validator';
import v from 'express-validator';
import { itemOps } from '../database/databaseOperations.js';
import { itemLogger } from '../loggers/logger.js';
import { isPostgresError, Item } from '../models/databaseObjects.js';
import { FilteredItemResult, FilterQueryParams, GroupedItems, ItemDataForClient, ItemFromClient, ItemPagination, ResponseForClient } from '../models/dtos.js';
import { FileSystemFunctions } from '../utils/fileSystem.js';
import { groupBy } from '../utils/utils.js';
import validator from 'validator';

let router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/add-items', upload.array('images'), async (req: Request, res: Response) => {
    let imagesForItem: Express.Multer.File[] = req.files as Express.Multer.File[];

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

    try {
        // TODO: grab the user's name from the jwt later down the line
        const username = 'dee'; // req.user?.username;
        await FileSystemFunctions.createDirForUser(username, itemData.name);
        await Promise.all([
            FileSystemFunctions.saveItemImages(imagesForItem[0], username, itemForDB.name),
            FileSystemFunctions.saveItemImages(imagesForItem[1], username, itemForDB.name),
            FileSystemFunctions.saveItemImages(imagesForItem[2], username, itemForDB.name)
        ]);

        const imageFilePaths: string[] = await FileSystemFunctions.getImagesFilePathForItem(username, itemForDB.name);
        itemForDB.image1 = imageFilePaths[0];
        itemForDB.image2 = imageFilePaths[1];
        itemForDB.image3 = imageFilePaths[2];
        
        const idOfInsertedItem: number = (await itemOps.postItem(itemForDB)).rows[0].id;
        
        // now save the categories if the user passed them in
        const categoriesInserted = await itemOps.postItemCategories(idOfInsertedItem, categoryIds);

        //return (dataInserted ? res.status(201).json("yeh hoe") : res.status(500).json("fail"));
        res.status(201).json("yeh hoe") 
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

router.post(
    '/update-items',
    [
        check('item').notEmpty()
    ],
    async (req: Request, res: Response) => {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(422).json({ errors: validationErrors.array() });
        }
        // make sure someone isn't trying to update an item that they don't own
        if (req.user && req.user.accountId == req.body.item.accountid) {
            const item: Item = req.body.item;

            try {
                const itemUpdated = await itemOps.updateItem(item);
                const responseForClient = { data: itemUpdated, error: ["Problem with database"] } as ResponseForClient<boolean>;
                return res.status(200).json(responseForClient);
            } catch (error) {
                if (isPostgresError(error)) {
                    itemLogger.error(`Tried to update item ${item.id}. Code ${error.code} Detail: ${error.detail}`);
                    const responseForClient = { data: [], error: ["Problem with database"] } as ResponseForClient<any>;
                    return res.status(503).json(responseForClient);
                } else {
                    itemLogger.error(`Tried to update item ${item.id}. Detail: ${error}`);
                    const responseForClient = { data: [], error: ["Server issue"] } as ResponseForClient<any>;
                    return res.status(503).json(responseForClient);
                }
            }
        } else {
            itemLogger.info(`${req.user?.username} at ${req.ip} tried to update an item (${req.body.item.accountid}) that they don't own. `);
            const responseForClient = { data: [], error: ["You don't own that item."] } as ResponseForClient<any>;
            return res.status(401).json(responseForClient);
        }
    }
);

router.post('/delete-items', check('deleteTheseIds').isArray().notEmpty(), async (req: Request, res: Response) => {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return res.status(422).json({ errors: validationErrors.array() });
    }

    const deleteTheseIds: number[] = req.body.deleteTheseIds;
    try {
        if (deleteTheseIds.length > 1) {
            const deleteComplete = itemOps.bulkDeleteItems(deleteTheseIds);
            return res.status(200).json();
        } else {
            const deleteComplete = itemOps.deleteItem(deleteTheseIds[0]);
            return res.status(200).json();
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
    '/fetch-items',
    [
        check('limit').notEmpty().isInt(),
        check('offset').notEmpty().isInt(),
        check('zipcodes').notEmpty().isArray()
    ],
    async (req: Request, res: Response) => {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(422).json({ errors: validationErrors.array() });
        }

        const limit = req.body.limit! as string;
        const offset = req.body.offset! as string;
        const zipcodes = req.body.zipcode! as number[];

        try {
            const totalRecords = await itemOps.fetchTotalRecordCount(limit, offset, zipcodes[0]);
            const records: Item[] = await itemOps.fetchItems(limit, offset, zipcodes[0]);

            if (records.length) {
                const recordData: ItemPagination = {
                    records,
                    totalRecords
                }
                const responseForClient = { data: recordData, error: [] } as ResponseForClient<ItemPagination>;
                return res.status(200).json(responseForClient);
            } else {
                return res.status(404).json('no records found');
            }
        } catch (error) {
            if (isPostgresError(error)) {
                itemLogger.error(`item fetch failed. Code: ${error.code}. Details: ${error.detail}`);
                return res.status(503).json();
            } else {
                itemLogger.error(`item fetch failed. Details: ${error}`);
                return res.status(500).json();
            }
        }
    }
);

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
                    filterQueryParams.offset, filterQueryParams.longAndLat, filterQueryParams.miles, safeText
                );
            } else {
                records = await itemOps.fetchFilteredItems(
                    filterQueryParams.categories, filterQueryParams.limit,
                    filterQueryParams.offset, filterQueryParams.longAndLat, filterQueryParams.miles
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
                return res.status(200).json(responseForClient);
            } else {
                const responseForClient = { data: [], error: [] } as ResponseForClient<ItemDataForClient[]>;
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

router.post('/search-items', check('searchTerm').isAlpha().trim().escape(), async(req:Request, res:Response) => {
    const searchTerm = req.body;
});

router.post('/image-practice', async (req: Request, res: Response) => {
    // await FileSystemFunctions.deleteItemImages();
    // let files = await FileSystemFunctions.loadItemImages('admin', 'Asians\r\n');
    const imageFilePaths: string[] = await FileSystemFunctions.getImagesFilePathForItem('admin', 'Test Plant');
    console.log(imageFilePaths);
    console.log(process.cwd());
    res.contentType('image/jpg');
    return res.status(200).json('ok');
})

export default router;