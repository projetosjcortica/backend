const backupService = require('../services/backupService');
const csvService = require('../services/csvService');
const path = require('path');
const parserService = require('../services/parserService');

exports.uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('No file uploaded');
      err.status = 400;
      throw err;
    }
    const meta = await backupService.backupFile(req.file);

    // if CSV, parse it from the work copy
    const ext = path.extname(meta.originalName).toLowerCase();
    let parseResult = null;
    if (ext === '.csv' || req.file.mimetype === 'text/csv') {
      // try parsing using the workPath (disk copy)
      parseResult = await csvService.processCSV({ path: meta.workPath });
      // create processed JSON
      const processed = await parserService.processFile(meta.workPath);
      return res.json({ meta, parse: parseResult, processed });
    }

    res.json({ meta, parse: parseResult });
  } catch (error) {
    next(error);
  }
};
