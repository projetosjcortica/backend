import { Request, Response, NextFunction } from 'express';
import backupService from '../services/backupService';
import { processCSV } from '../services/csvService';
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
      let parseResult = null;
      if (ext === '.csv' || file.mimetype === 'text/csv') {
        parseResult = await processCSV({ path: meta.workPath });
        const processed = await parserService.processFile(meta.workPath);
        return res.json({ meta, parse: parseResult, processed });
      }
      res.json({ meta, parse: parseResult });
    } catch (error) {
      next(error);
    }
  }
};
