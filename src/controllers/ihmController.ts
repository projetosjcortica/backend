import { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import IHMService from '../services/IHMService';
import backupService from '../services/backupService';
import parserService from '../services/parserService';
import * as fs from 'fs';

export default {
  fetchLatestFromIHM: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ip, user = 'anonymous', password = '' } = req.body as any;
      if (!ip) {
        const err = new Error('ip is required');
        (err as any).status = 400;
        throw err;
      }
      const tmpDir = path.resolve(process.cwd(), process.env.COLLECTOR_TMP || 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const ihm = new IHMService(ip, user, password);
      const result = await ihm.getArc(tmpDir);
      if (!result) return res.json({ message: 'no csv found' });
      const downloadedPath = result.localPath;
      const fileStat = fs.statSync(downloadedPath);
      const fileObj: any = { originalname: result.file, path: downloadedPath, mimetype: 'text/csv', size: fileStat.size };
      const meta = await backupService.backupFile(fileObj);
      const csvPath = meta.workPath || meta.backupPath;
      const processed = await parserService.processFile(csvPath);
      res.json({ meta, processed });
    } catch (error) {
      next(error);
    }
  }
};
