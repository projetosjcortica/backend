const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');

const processedDir = path.resolve(__dirname, '..', 'processed');
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

function parseDateTime(dateStr, timeStr) {
  // dateStr like '26/08/25' (DD/MM/YY) and timeStr like '17:40:00'
  const [d, m, y] = dateStr.split('/');
  const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
  // build ISO string
  return new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timeStr}`);
}

exports.processFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: false, trim: true }))
      .on('error', (err) => reject(err))
      .on('data', (row) => {
        // row is an array of fields
        try {
          const dateStr = row[0];
          const timeStr = row[1];
          const label = row[2];
          const group = row[3];
          const flag = row[4];
          const values = row.slice(5).map(v => {
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
          });

          const datetime = parseDateTime(dateStr, timeStr);
          rows.push({ datetime: datetime.toISOString(), label, group: Number(group) || null, flag: Number(flag) || null, values });
        } catch (e) {
          // ignore malformed rows but keep processing
        }
      })
      .on('end', (count) => {
        // write processed JSON
        const base = path.basename(filePath);
        const outName = base + '.json';
        const outPath = path.join(processedDir, outName);
        fs.writeFileSync(outPath, JSON.stringify({ source: base, rows }, null, 2));
        resolve({ processedPath: outPath, rowsCount: rows.length });
      });
  });
};
