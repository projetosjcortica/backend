# Backend

Refatorado Express backend pronto para produção (estrutura mínima).

Quick start

1. Instalar dependências:

```powershell
npm install
```

2. Copiar variáveis de ambiente:

```powershell
copy .env.example .env
```

3. Rodar em produção:

```powershell
npm start
```

4. Rodar em desenvolvimento (com nodemon):

```powershell
npm run dev
```

Endpoints principais

- GET /health - health check
- POST /upload-csv - processa CSV (body: { rows: [...] })
- POST /clean-db - limpa banco (simulado)
- GET /get-table - retorna dados de exemplo
 - POST /upload-file - upload de arquivo (multipart/form-data) salva em `backups/` e `work/`

- POST /ihm/fetch - baixar o relatório mais recente do IHM (body JSON: { ip, user?, password? })

Processed files

- `processed/` contém JSON gerado a partir dos CSVs presentes em `work/`.

Upload de arquivo (PowerShell example)

```powershell
curl -F "file=@C:\path\to\file.csv" http://localhost:3000/upload-file
```

Arquivos armazenados

- `backups/` contém cópias históricas e metadados JSON
- `work/` contém cópias que você pode processar (pipelines, parsing, etc.)

Python smoke test

1. Instale a dependência requests:

```powershell
pip install requests
```

2. Rode o script de teste:

```powershell
python scripts\server_test.py
```

Notas

- Atualize `services/*` para integrar com banco real (Prisma, Sequelize, etc.)
- Configure `DATABASE_URL` em `.env` quando integrar o DB
