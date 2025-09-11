/**
 * Controller com helpers para paginação e endpoints legados relacionados à tabela `relatorio`.
 */

import { Request, Response, NextFunction } from 'express';
import { AppDataSource, initDb } from '../services/dbService';
import { Relatorio } from '../entities/Relatorio';

/**
 * Helper function to query rows from the `relatorio` table and map them to the API response format.
 * @param {number} page - The current page number for pagination.
 * @param {number} pageSize - The number of records per page.
 * @returns {Promise<{ rows: any[], total: number }>} - An object containing the mapped rows and the total record count.
 */
async function queryDbRows(page: number, pageSize: number) {
  await initDb(); // Initialize the database connection
  const repo = AppDataSource.getRepository(Relatorio); // Get the repository for the Relatorio entity

  // Create a query to fetch data ordered by Dia and Hora in descending order
  const qb = repo.createQueryBuilder('r').orderBy('r.Dia', 'DESC').addOrderBy('r.Hora', 'DESC');
  const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();

  // Map the results to the expected API format
  const rows = items.map((it: any) => {
    const values: Array<number | null> = [];
    for (let i = 1; i <= 40; i++) {
      const v = (it as any)[`Prod_${i}`];
      values.push(v == null ? null : Number(v));
    }
    return {
      Dia: it.Dia || null,
      Hora: it.Hora || null,
      Nome: it.Nome || null,
      Form1: it.Form1 != null ? Number(it.Form1) : null,
      Form2: it.Form2 != null ? Number(it.Form2) : null,
      values,
      processedFile: (it as any).processedFile || null,
    };
  });

  return { rows, total }; // Return the mapped rows and total record count
}

// Controlador para paginação de dados
const paginateController = {
  /**
   * Legacy endpoint to fetch paginated data from the database.
   * @route GET /data
   */
  paginate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1)); // Determine the current page
      const pageSize = Math.max(1, Number(req.query.qtdPag || (req.query.pageSize as any) || 300)); // Determine the page size
      try {
        const { rows, total } = await queryDbRows(page, pageSize);
        res.json({ page, pageSize, rows, total });
      } catch (e) {
        next(e);
      }
    } catch (err) {
      next(err); // Pass the error to the error-handling middleware
    }
  },

  /**
   * Fetch paginated relatorio data.
   * @route GET /api/relatorio
   */
  listRelatorio: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.max(1, Number(req.query.pageSize || 50));
      const { rows, total } = await queryDbRows(page, pageSize);
      res.json({ page, pageSize, rows, total });
    } catch (err) {
      next(err);
    }
  },

  /**
   * List distinct processedFile values from the database (currently disabled).
   * @route GET /api/relatorio/files
   */
  listFiles: async (_req: Request, res: Response) => {
    // This endpoint is disabled and returns an empty list
    return res.json([]);
  },

  /**
   * Count the total number of rows in the relatorio table.
   * @route GET /api/relatorio/count
   */
  countFile: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await initDb();
      const repo = AppDataSource.getRepository(Relatorio);
      const count = await repo.count();
      res.json({ count });
    } catch (err) {
      next(err);
    }
  }
};

export default paginateController;
