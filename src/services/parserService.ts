import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'fast-csv';

const processedDir = path.resolve(__dirname, '..', '..', 'processed');
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

function parseDateTime(dateStr: string, timeStr: string) {
  if (!dateStr || !timeStr) return new Date();
  const parts = dateStr.split('/');
  const d = parts[0] || '01';
  const m = parts[1] || '01';
  const y = parts[2] || '00';
  const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
  return new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timeStr}`);
}

export default {
  processFile: (filePath: string) => {
    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      fs.createReadStream(filePath)
        .pipe(parse({ headers: false, trim: true }))
  .on('error', (err: unknown) => reject(err))
        .on('data', (row: any) => {
          try {
            const dateStr = row[0];
            const timeStr = row[1];
            const label = row[2];
            const group = row[3];
            const flag = row[4];
            const values = row.slice(5).map((v: string) => {
              const n = Number(v);
              return Number.isNaN(n) ? null : n;
            });
            const datetime = parseDateTime(dateStr, timeStr);
            rows.push({ datetime: datetime.toISOString(), label, group: Number(group) || null, flag: Number(flag) || null, values });
          } catch (e) {
          }
        })
        .on('end', (count: number) => {
          const base = path.basename(filePath);
          const outName = base + '.json';
          const outPath = path.join(processedDir, outName);
          fs.writeFileSync(outPath, JSON.stringify({ source: base, rows }, null, 2));
          resolve({ processedPath: outPath, rowsCount: rows.length });
        });
    });
  }
};
