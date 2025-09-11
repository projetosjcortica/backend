import { Request, Response, NextFunction } from 'express';
import backupService from '../services/backupService';
import parserService from '../services/parserService';
import * as path from 'path';

export default {
  uploadFile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = (req as any).file;
      if (!file) {
        const err = new Error('No file uploaded');
        (err as any).status = 400;
        throw err;
      }
      const meta = await backupService.backupFile(file);
      const ext = path.extname(meta.originalName).toLowerCase();
      if (ext === '.csv' || file.mimetype === 'text/csv') {
        const csvPath = meta.workPath || meta.backupPath;
        const processed = await parserService.processFile(csvPath);
        return res.json({ meta, processed });
      }
      res.json({ meta });
    } catch (error) {
      next(error);
    }
  }
};
