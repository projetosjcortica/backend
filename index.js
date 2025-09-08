// TODO: create a router to start handle requests

const express = require('express');

const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Started backend server!');
});

// Importando funções dos UseCases
const { uploadCSV } = require('./UseCase/UploadCSV');
const { cleanDb } = require('./UseCase/CleanDb');
const { getTable } = require('./UseCase/GetTable');

// Rota para upload de CSV
app.post('/upload-csv', async (req, res) => {
    try {
        const result = await uploadCSV(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rota para limpar o banco
app.post('/clean-db', async (req, res) => {
    try {
        const result = await cleanDb();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rota para obter uma tabela
app.get('/get-table', async (req, res) => {
    try {
        const result = await getTable();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});