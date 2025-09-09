import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Batch } from '../entities/Batch';
import { Row } from '../entities/Row';

const DB_PATH = process.env.DATABASE_PATH || 'data.sqlite';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: DB_PATH,
  synchronize: true,
  logging: false,
  entities: [Batch, Row],
});

export async function initDb() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}

export async function saveBatch(batchPayload: any) {
  await initDb();
  const repo = AppDataSource.getRepository(Batch);
  const rowRepo = AppDataSource.getRepository(Row);

  const batch = repo.create({
    source: batchPayload.source || 'collector',
    fileName: batchPayload.sourceName || batchPayload.fileName || 'unknown',
    fileTimestamp: batchPayload.fileTimestamp ? new Date(batchPayload.fileTimestamp) : null,
    rowCount: (batchPayload.rows && batchPayload.rows.length) || 0,
    meta: batchPayload.meta || {},
  });

  const saved = await repo.save(batch);

  if (batchPayload.rows && Array.isArray(batchPayload.rows)) {
    const rows = batchPayload.rows.map((r: any) => rowRepo.create({
      batch: saved,
      datetime: r.datetime ? new Date(r.datetime) : null,
      label: r.label || null,
      group: r.group || null,
      flag: r.flag || null,
      values: r.values || null,
    }));
    await rowRepo.save(rows);
  }

  return saved;
}
