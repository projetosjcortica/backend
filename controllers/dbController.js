const dbService = require('../services/dbService');

exports.cleanDb = async (req, res) => {
  try {
    const result = await dbService.cleanDatabase();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTable = async (req, res) => {
  try {
    const result = await dbService.getTableData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
