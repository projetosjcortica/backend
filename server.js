const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const logsMiddleware = require('./middleware/logs');
const csvController = require('./controllers/csvController');
const dbController = require('./controllers/dbController');

app.use(express.json());
app.use(logsMiddleware);

app.post('/upload-csv', csvController.uploadCSV);
app.post('/clean-db', dbController.cleanDb);
app.get('/get-table', dbController.getTable);

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
