const dbService = require('../services/dbService');

exports.cleanDb = async (req, res, next) => {
  try {
    const result = await dbService.cleanDatabase();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.getTable = async (req, res, next) => {
  try {
    const result = await dbService.getTableData();
    res.json(result);
  } catch (error) {
    next(error);
  }
};
