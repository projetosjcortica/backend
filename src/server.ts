import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import logsMiddleware from './middleware/logs';
import errorHandler from './middleware/errorHandler';
import ihmController from './controllers/ihmController';
import paginateController from './controllers/paginateController';

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('combined'));
app.use(logsMiddleware);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => res.json({ status: 'ok' }));

// IHM-related endpoints
app.post('/ihm/fetch', express.json(), ihmController.fetchLatestFromIHM as any);

// Relatório endpoints
app.get('/api/relatorio', paginateController.listRelatorio as any);
app.get('/api/relatorio/count', paginateController.countFile as any);

// Error handling middleware
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
