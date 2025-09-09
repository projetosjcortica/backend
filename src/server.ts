import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import * as path from 'path';

import logsMiddleware from './middleware/logs';
import errorHandler from './middleware/errorHandler';
import fileController from './controllers/fileController';
import ihmController from './controllers/ihmController';
import paginateController from './controllers/paginateController';

import multer from 'multer';

const app = express();
const port = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('combined'));
app.use(logsMiddleware);

app.get('/health', (req: Request, res: Response) => res.json({ status: 'ok' }));
app.get('/', (req: Request, res: Response) => res.json({ message: 'Started backend server!', uptime: process.uptime() }));

app.post('/upload-file', upload.single('file'), fileController.uploadFile as any);
app.post('/ihm/fetch', express.json(), ihmController.fetchLatestFromIHM as any);
app.get('/data', paginateController.paginate as any);

app.use('/backups', express.static(path.join(__dirname, '..', 'backups')));
app.use('/work', express.static(path.join(__dirname, '..', 'work')));

app.use(errorHandler as any);

let server: any;
export function startServer() {
  server = app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}

if (require.main === module) {
  startServer();
}

export default app;
