const csvService = require('../services/csvService');

exports.uploadCSV = async (req, res) => {
  try {
    const result = await csvService.processCSV(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
