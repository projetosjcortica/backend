import { Request, Response, NextFunction } from 'express';
import { AppDataSource, initDb, countRelatorioByFile } from '../services/dbService';
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
      const k = `Prod_${i}`;
      values.push(it[k] != null ? Number(it[k]) : null);
    }
    return {
      Dia: it.Dia || null,
      Hora: it.Hora || null,
      Nome: it.Nome || null,
      Form1: it.Form1 != null ? Number(it.Form1) : null,
      Form2: it.Form2 != null ? Number(it.Form2) : null,
      values,
      processedFile: it.processedFile || null,
    };
  });

  return { rows, total }; // Return the mapped rows and total record count
}

export default {
  /**
   * Legacy endpoint to fetch paginated data from the database.
   * @route GET /data
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @param {NextFunction} next - The next middleware function.
   */
  paginate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1)); // Determine the current page
      const pageSize = Math.max(1, Number(req.query.qtdPag || req.query.pageSize || 300)); // Determine the page size
      try {
        const dbResult = await queryDbRows(page, pageSize); // Query the database
        const total = dbResult.total;
        const totalPages = Math.max(1, Math.ceil(total / pageSize)); // Calculate total pages
        return res.json({ page, pageSize, total, totalPages, data: dbResult.rows }); // Return paginated data
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return res.status(503).json({ error: 'Database not available', detail }); // Return error if the database is unavailable
      }
    } catch (err) {
      next(err); // Pass the error to the error-handling middleware
    }
  },

  /**
   * Fetch paginated relatorio data.
   * @route GET /api/relatorio
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @param {NextFunction} next - The next middleware function.
   */
  listRelatorio: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1)); // Determine the current page
      const pageSize = Math.max(1, Number(req.query.pageSize || 300)); // Determine the page size
      try {
        const dbResult = await queryDbRows(page, pageSize); // Query the database
        const total = dbResult.total;
        const totalPages = Math.max(1, Math.ceil(total / pageSize)); // Calculate total pages
        return res.json({ page, pageSize, total, totalPages, data: dbResult.rows }); // Return paginated data
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return res.status(503).json({ error: 'Database not available', detail }); // Return error if the database is unavailable
      }
    } catch (err) {
      next(err); // Pass the error to the error-handling middleware
    }
  },

  /**
   * List distinct processedFile values from the database (currently disabled).
   * @route GET /api/relatorio/files
   * @param {Request} _req - The Express request object (unused).
   * @param {Response} res - The Express response object.
   */
  listFiles: async (_req: Request, res: Response) => {
    // This endpoint is disabled and returns an empty list
    return res.json([]);
  },

  /**
   * Count the total number of rows in the relatorio table.
   * @route GET /api/relatorio/count
   * @param {Request} _req - The Express request object (unused).
   * @param {Response} res - The Express response object.
   * @param {NextFunction} next - The next middleware function.
   */
  countFile: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await initDb(); // Initialize the database connection
      const repo = AppDataSource.getRepository(Relatorio); // Get the repository for the Relatorio entity
      const total = await repo.count(); // Count the total records in the table
      res.json({ count: total }); // Return the total count
    } catch (err) {
      next(err); // Pass the error to the error-handling middleware
    }
  }
};
