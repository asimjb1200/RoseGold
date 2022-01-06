import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import * as dbHelpers from './database/databaseOperations.js';
import schedule from 'node-schedule';
import userRouter from './routes/users.js';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import logger from 'morgan';
import fs from 'fs';
let accessLogStream = fs.createWriteStream(path.join(__dirname, '/logs/access.log'), { flags: 'a' });

let app = express();

app.use(compression()); //use compression
app.use(logger('dev'));
app.use(logger('combined', { stream: accessLogStream }))
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/users', userRouter);
export default app;
