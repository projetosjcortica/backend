const csvService = require('../services/csvService');

exports.uploadCSV = async (req, res, next) => {
  try {
    const result = await csvService.processCSV(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
};
