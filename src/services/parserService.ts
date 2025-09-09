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
        .pipe(parse({ headers: true, trim: true, delimiter: ';' }))
        .on('error', (err: unknown) => reject(err))
        .on('data', (row: any) => {
          try {
            const dateStr = row['date'] || row['Date'] || row[0];
            const timeStr = row['time'] || row['Time'] || row[1];
            const label = row['label'] || row['Label'] || row['label'];
            const group = row['group'] || row['Group'] || row['group'];
            const flag = row['flag'] || row['Flag'] || row['flag'];
            // collect remaining numeric columns
            const values: number[] = [];
            for (const k of Object.keys(row)) {
              if (!['date', 'time', 'label', 'group', 'flag', 'Date', 'Time', 'Label', 'Group', 'Flag'].includes(k)) {
                const n = Number(row[k]);
                values.push(Number.isNaN(n) ? null as any : n);
              }
            }
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
