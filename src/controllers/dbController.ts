import { Request, Response, NextFunction } from 'express';
import { AppDataSource, getBatchesPaginated } from '../services/dbService';
import { Batch } from '../entities/Batch';

export default {
  listBatches: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.max(1, Number(req.query.pageSize || 50));
      const out = await getBatchesPaginated(page, pageSize);
      res.json(out);
    } catch (err) {
      next(err);
    }
  },
  getBatch: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      if (!AppDataSource.isInitialized) await AppDataSource.initialize();
      const repo = AppDataSource.getRepository(Batch);
      const item = await repo.findOne({ where: { id } as any, relations: ['rows'] });
      if (!item) return res.status(404).json({ error: 'not found' });
      res.json({ item });
    } catch (err) {
      next(err);
    }
  }
};
