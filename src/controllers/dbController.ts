import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../services/dbService';
import { Batch } from '../entities/Batch';

export default {
  listBatches: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!AppDataSource.isInitialized) await AppDataSource.initialize();
      const repo = AppDataSource.getRepository(Batch);
      const items = await repo.find({ relations: ['rows'], order: { id: 'DESC' } as any, take: 50 });
      res.json({ items });
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
