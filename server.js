require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 3000;

const csvController = require('./controllers/csvController');
const dbController = require('./controllers/dbController');
const logsMiddleware = require('./middleware/logs');
const errorHandler = require('./middleware/errorHandler');
const fileController = require('./controllers/fileController');
const ihmController = require('./controllers/ihmController');
const multer = require('multer');
const path = require('path');

// Multer em memória (podemos alterar para diskStorage se preferir)
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('combined'));
app.use(logsMiddleware);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Root for quick test
app.get('/', (req, res) => {
  res.json({ message: 'Started backend server!', uptime: process.uptime() });
});

// API routes
app.post('/upload-csv', csvController.uploadCSV);
app.post('/clean-db', dbController.cleanDb);
app.get('/get-table', dbController.getTable);
// Endpoint para upload de arquivo (CSV)
app.post('/upload-file', upload.single('file'), fileController.uploadFile);

// endpoint to trigger IHM fetch: POST /ihm/fetch { ip, user, password }
app.post('/ihm/fetch', express.json(), ihmController.fetchLatestFromIHM);

// Rotas úteis para listar/backups (expor com cuidado em produção)
app.use('/backups', express.static(path.join(__dirname, 'backups')));
app.use('/work', express.static(path.join(__dirname, 'work')));

// Error handler (deve ficar após as rotas)
app.use(errorHandler);

let server;

function startServer() {
  server = app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });

  process.on('SIGINT', () => {
    console.log('Shutting down...');
    server.close(() => process.exit(0));
  });
}

// start if run directly
if (require.main === module) {
  startServer();
}

module.exports = app;

