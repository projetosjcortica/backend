const fs = require('fs');
const csv = require('fast-csv');

// parse CSV from buffer or file path
exports.processCSV = (input) => {
  return new Promise((resolve, reject) => {
    const rows = [];

    const onData = (row) => rows.push(row);
    const onEnd = () => resolve({ message: 'CSV parsed', rowsCount: rows.length, rows });
    const onError = (err) => reject(err);

    if (input && input.buffer) {
      // from buffer
      const stream = fs.createReadStream(null, { fd: null });
      // fast-csv can parse from stream; create a stream from buffer using Readable
      const { Readable } = require('stream');
      const r = new Readable();
      r.push(input.buffer);
      r.push(null);
      r.pipe(csv.parse({ headers: true }))
        .on('error', onError)
        .on('data', onData)
        .on('end', onEnd);
    } else if (input && input.path) {
      fs.createReadStream(input.path)
        .pipe(csv.parse({ headers: true }))
        .on('error', onError)
        .on('data', onData)
        .on('end', onEnd);
    } else {
      reject(new Error('Invalid input for CSV parsing'));
    }
  });
};
