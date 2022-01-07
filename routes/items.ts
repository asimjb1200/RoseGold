import express, { Request, Response } from 'express';
import { check, validationResult } from 'express-validator';
import { itemOps } from '../database/databaseOperations.js';
import { itemLogger } from '../loggers/logger.js';
import { isPostgresError, Item } from '../models/databaseObjects.js';
let router = express.Router();

router.post('/add-items', check('items').isArray().notEmpty(), async (req:Request, res: Response) => {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return res.status(422).json({errors: validationErrors.array()});
    }
    
    const itemData: Item[] = req.body.items;
    try {
        if (itemData.length > 1) {
            const dataInserted = await itemOps.bulkPostItems(itemData);
            return (dataInserted ? res.status(200).json("yeh hoe") : res.status(500).json("fail"));
        } else {
            const dataInserted = await itemOps.postItem(itemData[0]);
            return (dataInserted ? res.status(200).json("yeh hoe") : res.status(500).json("fail"));
        }
    } catch (error) {
        if (isPostgresError(error)) {
            itemLogger.error(`Tried to bulk add items. Pg code: ${error.code} Details: ${error.detail}`);
            return res.status(500).json("fail");
        } else {
            return res.status(500).json("fail");
        }
    }
});

router.post('/update-items', async (req:Request, res: Response) => {
    
});

router.post('/delete-items', check('deleteTheseIds').isArray().notEmpty(), async (req:Request, res: Response) => {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return res.status(422).json({errors: validationErrors.array()});
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

export default router;