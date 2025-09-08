const path = require('path');
const IHMService = require('../services/IHMService');
const backupService = require('../services/backupService');
const parserService = require('../services/parserService');

exports.fetchLatestFromIHM = async (req, res, next) => {
  try {
    const { ip, user = 'anonymous', password = '' } = req.body;
    if (!ip) {
      const err = new Error('ip is required');
      err.status = 400;
      throw err;
    }

    const tmpDir = path.resolve(__dirname, '..', 'tmp');
    if (!require('fs').existsSync(tmpDir)) require('fs').mkdirSync(tmpDir, { recursive: true });

    const ihm = new IHMService(ip, user, password);
    const result = await ihm.getArc(tmpDir);
    if (!result) return res.json({ message: 'no csv found' });

    // move downloaded file to backups and work via backupService
    const downloadedPath = result.localPath;
    const fileStat = require('fs').statSync(downloadedPath);
    const fileObj = { originalname: result.file, path: downloadedPath, mimetype: 'text/csv', size: fileStat.size };

    const meta = await backupService.backupFile(fileObj);
    const parseResult = await parserService.processFile(meta.workPath);

    res.json({ meta, processed: parseResult });
  } catch (error) {
    next(error);
  }
};
