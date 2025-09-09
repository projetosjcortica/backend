import * as fs from 'fs';
import { parse } from 'fast-csv';
import { Readable } from 'stream';

export async function processCSV(input: any) {
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    const onData = (row: any) => rows.push(row);
    const onEnd = () => resolve({ message: 'CSV parsed', rowsCount: rows.length, rows });
    const onError = (err: unknown) => reject(err);

    if (input && input.buffer) {
      const r = new Readable();
      r.push(input.buffer);
      r.push(null);
      r.pipe(parse({ headers: true }))
        .on('error', onError)
        .on('data', onData)
        .on('end', onEnd);
    } else if (input && input.path) {
      fs.createReadStream(input.path)
        .pipe(parse({ headers: true }))
        .on('error', onError)
        .on('data', onData)
        .on('end', onEnd);
    } else {
      reject(new Error('Invalid input for CSV parsing'));
    }
  });
}

export default { processCSV };
