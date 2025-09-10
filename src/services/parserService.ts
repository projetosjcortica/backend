import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'fast-csv';

const downloadsDir = path.resolve(__dirname, '..', '..', 'downloads');
const processedDir = path.join(downloadsDir, 'processed');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
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

class ParserService {
  downloadsDir: string;
  processedDir: string;

  constructor(downloads = downloadsDir, processed = processedDir) {
    this.downloadsDir = downloads;
    this.processedDir = processed;
  }

  processFile(filePath: string) {
    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      // detect delimiter and header presence by inspecting first line
      let firstLine = '';
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        firstLine = raw.split(/\r?\n/)[0] || '';
      } catch (e) {
        return reject(e);
      }
      const delim = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
      const hasHeader = /date|time|label|group|flag/i.test(firstLine);

      fs.createReadStream(filePath)
        .pipe(parse({ headers: hasHeader, trim: true, delimiter: delim }))
        .on('error', (err: unknown) => reject(err))
        .on('data', (row: any) => {
          try {
            let dateStr: string | undefined;
            let timeStr: string | undefined;
            let label: string | undefined;
            let group: any;
            let flag: any;
            const values: number[] = [];
            if (hasHeader) {
              dateStr = row['date'] || row['Date'];
              timeStr = row['time'] || row['Time'];
              label = row['label'] || row['Label'];
              group = row['group'] || row['Group'];
              flag = row['flag'] || row['Flag'];
              for (const k of Object.keys(row)) {
                if (!/^(date|time|label|group|flag)$/i.test(k)) {
                  const n = Number(row[k]);
                  values.push(Number.isNaN(n) ? null as any : n);
                }
              }
            } else {
              // row is an array
              dateStr = row[0];
              timeStr = row[1];
              label = row[2];
              group = row[3];
              flag = row[4];
              for (let i = 5; i < row.length; i++) {
                const n = Number(row[i]);
                values.push(Number.isNaN(n) ? null as any : n);
              }
            }
            const datetime = parseDateTime(dateStr as any, timeStr as any);
            rows.push({ datetime: datetime.toISOString(), label, group: group ? Number(group) : null, flag: flag ? Number(flag) : null, values });
          } catch (e) {
            // ignore individual row errors
          }
        })
        .on('end', (count: number) => {
          // emulate legacy FileCSV behavior: when file has no header, many callers expect
          // the first line to be skipped (treated as header). Remove first parsed row
          // in that case to preserve existing test expectations.
          if (!hasHeader && rows.length > 0) rows.shift();
          const base = path.basename(filePath);
          const outName = base + '.json';
          const outPath = path.join(this.processedDir, outName);
          fs.writeFileSync(outPath, JSON.stringify({ source: base, rows }, null, 2));
          resolve({ processedPath: outPath, rowsCount: rows.length, rows });
        });
    });
  }
}

const parserService = new ParserService();
export default parserService;
export const processFile = (filePath: string) => parserService.processFile(filePath);
