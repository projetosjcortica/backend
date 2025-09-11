import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../services/dbService';
import { Batch } from '../entities/Batch';

export default {
  listBatches: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.max(1, Number(req.query.pageSize || 50));
      if (!AppDataSource.isInitialized) await AppDataSource.initialize();
      const repo = AppDataSource.getRepository(Batch);
      const [items, total] = await repo.findAndCount({ skip: (page - 1) * pageSize, take: pageSize });
      res.json({ items, total, page, pageSize });
    } catch (err) {
      next(err);
    }
  }
};
