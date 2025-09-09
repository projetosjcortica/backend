import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import parserService from '../services/parserService';

const processedDir = path.resolve(__dirname, '..', '..', 'processed');

async function ensureProcessedForCsv(csvPath: string) {
  // if processed JSON exists for this csv, return path; else create it
  const base = path.basename(csvPath);
  const outPath = path.join(processedDir, base + '.json');
  if (fs.existsSync(outPath)) return outPath;
  await parserService.processFile(csvPath);
  return outPath;
}

export default {
  paginate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const qtdPag = Math.max(1, Number(req.query.qtdPag || 300));
      const file = req.query.file as string | undefined;

      let processedPath: string | null = null;

      if (file) {
        const requested = path.resolve(process.cwd(), file);
        if (fs.existsSync(requested)) {
          if (requested.toLowerCase().endsWith('.csv')) {
            processedPath = await ensureProcessedForCsv(requested);
          } else if (requested.toLowerCase().endsWith('.json')) {
            processedPath = requested;
          } else {
            // try processed dir
            const candidate = path.join(processedDir, path.basename(requested) + '.json');
            if (fs.existsSync(candidate)) processedPath = candidate;
          }
        } else {
          // try in processed dir directly
          const candidate = path.join(processedDir, file);
          if (fs.existsSync(candidate)) processedPath = candidate;
        }
      }

      if (!processedPath) {
        // pick latest processed file in processedDir
        if (!fs.existsSync(processedDir)) {
          return res.json({ page, qtdPag, total: 0, totalPages: 0, data: [] });
        }
  const items = fs.readdirSync(processedDir).filter((f: string) => f.toLowerCase().endsWith('.json'));
  if (items.length === 0) return res.json({ page, qtdPag, total: 0, totalPages: 0, data: [] });
  const stats = items.map((f: string) => ({ f, mtime: fs.statSync(path.join(processedDir, f)).mtime.getTime() }));
  stats.sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
  if (stats.length === 0) return res.json({ page, qtdPag, total: 0, totalPages: 0, data: [] });
  const top = stats[0]!;
  processedPath = path.join(processedDir, top.f);
      }

      const raw = fs.readFileSync(processedPath, 'utf8');
      const parsed = JSON.parse(raw);
      const rows = parsed.rows || [];
      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / qtdPag));
      const start = (page - 1) * qtdPag;
      const data = rows.slice(start, start + qtdPag);

      res.json({ page, qtdPag, total, totalPages, data });
    } catch (error) {
      next(error);
    }
  }
};
