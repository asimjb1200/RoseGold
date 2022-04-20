import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import userRouter from './routes/users.js';
import itemRouter from './routes/items.js';
import chatRouter from './routes/chat.js';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { dirname } from 'path';
import { authenticateJWT } from './security/tokens/tokens.js';
const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);
const pathToImagesFolder = path.join(__dirname, '/images');
import logger from 'morgan';
import fs from 'fs';
let accessLogStream = fs.createWriteStream(path.join(__dirname, '/logs/access.log'), { flags: 'a' });

let app = express();

app.use(compression()); //use compression
app.use(logger('dev'));
app.use(logger('combined', { stream: accessLogStream }));
app.use(cookieParser());
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({
  extended: true,
  limit: '100mb'
}));
app.use('/api/images', express.static(pathToImagesFolder)); // serve images from the static folder
app.use('/api/users', userRouter);
app.use('/api/item-handler', authenticateJWT, itemRouter);
app.use('/api/chat-handler', authenticateJWT, chatRouter);
export default app;
