import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import parserService from '../services/parserService';
import { initDb, getLastRelatorioTimestamp, insertRelatorioRows, countRelatorioByFile } from '../services/dbService';

const downloadsDir = path.resolve(__dirname, '..', '..', 'downloads');
const processedDir = path.join(downloadsDir, 'processed');

async function ensureProcessedForCsv(csvPath: string) {
  const base = path.basename(csvPath);
  const outPath = path.join(processedDir, base + '.json');
  if (fs.existsSync(outPath)) return outPath;
  await parserService.processFile(csvPath);
  return outPath;
}

// helpers
function readProcessed(processedPath: string) {
  const raw = fs.readFileSync(processedPath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.rows || [];
}

export default {
  // legacy compatibility: old /data route
  paginate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.max(1, Number(req.query.qtdPag || req.query.pageSize || 300));
      const file = req.query.file as string | undefined;

      // if DB configured, prefer database-backed pagination via Relatorio table
      if (process.env.DATABASE_PATH) {
        try {
          await initDb();
          // For legacy compatibility, return last processed file rows paginated
          // We keep previous behavior: return rows from processed JSON if DB isn't available.
        } catch (_) {}
      }

      // fallback to file-based behavior
      let processedPath: string | null = null;
      if (file) {
        const requested = path.resolve(process.cwd(), file);
        if (fs.existsSync(requested)) {
          if (requested.toLowerCase().endsWith('.csv')) {
            processedPath = await ensureProcessedForCsv(requested);
          } else if (requested.toLowerCase().endsWith('.json')) {
            processedPath = requested;
          } else {
            const candidate = path.join(processedDir, path.basename(requested) + '.json');
            if (fs.existsSync(candidate)) processedPath = candidate;
          }
        } else {
          const candidate = path.join(processedDir, file);
          if (fs.existsSync(candidate)) processedPath = candidate;
        }
      }

      if (!processedPath) {
        if (!fs.existsSync(processedDir)) return res.json({ page, pageSize, total: 0, totalPages: 0, data: [] });
        const items = fs.readdirSync(processedDir).filter((f: string) => f.toLowerCase().endsWith('.json'));
        if (items.length === 0) return res.json({ page, pageSize, total: 0, totalPages: 0, data: [] });
        const stats = items.map((f: string) => ({ f, mtime: fs.statSync(path.join(processedDir, f)).mtime.getTime() }));
        stats.sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
        if (stats[0] && stats[0].f) {
          processedPath = path.join(processedDir, stats[0].f);
        }
      }

      const rows = processedPath ? readProcessed(processedPath) : [];
      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const data = rows.slice(start, start + pageSize);
      res.json({ page, pageSize, total, totalPages, data });
    } catch (error) {
      next(error);
    }
  },

  // new RESTful: GET /api/relatorio?page=&pageSize=&file=
  listRelatorio: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.max(1, Number(req.query.pageSize || 300));
      const file = req.query.file as string | undefined;

      // if DB available, use Relatorio table
      if (process.env.DATABASE_PATH) {
        try {
          await initDb();
          // simple query via AppDataSource will be used by dbService callers; for now fall back to file behavior
        } catch (_) {}
      }

      let processedPath: string | null = null;
      if (file) {
        const candidate = path.join(processedDir, file);
        if (fs.existsSync(candidate)) processedPath = candidate;
        else {
          const resolved = path.resolve(process.cwd(), file);
          if (fs.existsSync(resolved)) processedPath = resolved;
        }
      }

      if (!processedPath) {
        if (!fs.existsSync(processedDir)) return res.json({ page, pageSize, total: 0, totalPages: 0, data: [] });
        const items = fs.readdirSync(processedDir).filter((f: string) => f.toLowerCase().endsWith('.json'));
        if (items.length === 0) return res.json({ page, pageSize, total: 0, totalPages: 0, data: [] });
        const stats = items.map((f: string) => ({ f, mtime: fs.statSync(path.join(processedDir, f)).mtime.getTime() }));
        stats.sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
        if (stats[0] && stats[0].f) {
          processedPath = path.join(processedDir, stats[0].f);
        }
      }

      const rows = processedPath ? readProcessed(processedPath) : [];
      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const data = rows.slice(start, start + pageSize);
      res.json({ page, pageSize, total, totalPages, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/relatorio/files -> list available processed files
  listFiles: async (_req: Request, res: Response) => {
    if (!fs.existsSync(processedDir)) return res.json([]);
    const items = fs.readdirSync(processedDir).filter((f: string) => f.toLowerCase().endsWith('.json'));
    const stats = items.map((f: string) => ({ name: f, mtime: fs.statSync(path.join(processedDir, f)).mtime.getTime() }));
    stats.sort((a: any, b: any) => b.mtime - a.mtime);
    res.json(stats.map(s => s.name));
  },

  // GET /api/relatorio/count?file=filename.json
  countFile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.query.file as string | undefined;
      if (!file) return res.status(400).json({ error: 'file query param required' });
      const candidate = path.join(processedDir, file);
      if (!fs.existsSync(candidate)) return res.status(404).json({ error: 'file not found' });
      const rows = readProcessed(candidate);
      res.json({ file, count: rows.length });
    } catch (err) {
      next(err);
    }
  }
};
