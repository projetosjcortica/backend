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

export async function getBatchesPaginated(page = 1, pageSize = 50) {
  await initDb();
  const repo = AppDataSource.getRepository(Batch);
  const [items, total] = await repo.findAndCount({ order: { id: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages, items };
}

export async function getRowsPaginated(batchId: number | null, page = 1, pageSize = 300) {
  await initDb();
  const repo = AppDataSource.getRepository(Row);
  const qb = repo.createQueryBuilder('row').leftJoinAndSelect('row.batch', 'batch');
  if (batchId) qb.where('batch.id = :id', { id: batchId });
  qb.orderBy('row.id', 'ASC').skip((page - 1) * pageSize).take(pageSize);
  const [items, total] = await qb.getManyAndCount();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages, items };
}
