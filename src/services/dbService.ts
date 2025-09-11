import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Relatorio } from '../entities/Relatorio';
import BaseService from './BaseService';

const useMysql = true;
const DB_PATH = process.env.DATABASE_PATH || 'data.sqlite';
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost'; // Garantir localhost como padrão

class DBService extends BaseService {
  public ds: DataSource;

  constructor() {
    super('DBService');
    this.ds = useMysql
      ? new DataSource({
          type: 'mysql',
          host: MYSQL_HOST, // Usar localhost como padrão
          port: Number(process.env.MYSQL_PORT || 3306),
          username: process.env.MYSQL_USER || process.env.DB_USER || 'root',
          password: process.env.MYSQL_PASS || process.env.DB_PASS || 'root',
          database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'cadastro',
          synchronize: true,
          logging: false,
          entities: [Relatorio],
        })
      : new DataSource({
          type: 'sqlite',
          database: DB_PATH,
          synchronize: true,
          logging: false,
          entities: [Relatorio],
        });
  }

  async init(): Promise<void> {
    if (!this.ds.isInitialized) {
      try {
        await this.ds.initialize();
        console.log('Database connection established successfully.');
      } catch (error) {
        console.error('Failed to connect to the database:', error);
        throw new Error('Database connection error. Please check your configuration.');
      }
    }
  }

  async destroy(): Promise<void> {
    if (this.ds.isInitialized) await this.ds.destroy();
  }

  async insertRelatorioRows(rows: any[], processedFile: string) {
    await this.init();
    const repo = this.ds.getRepository(Relatorio);
    // console.log(rows);
    const entities = rows.map(r => {
      const base: any = {
        Dia: r.Dia || r.date || null,
        Hora: r.Hora || r.time || null,
        Nome: r.Nome || r.label || null,
        // accept multiple possible property names coming from parser/mapRow
        Form1:
          r.Form1 != null ? Number(r.Form1) : (r.form1 != null ? Number(r.form1) : (r.group != null ? Number(r.group) : null)),
        Form2:
          r.Form2 != null ? Number(r.Form2) : (r.form2 != null ? Number(r.form2) : (r.flag != null ? Number(r.flag) : null)),
        processedFile,
      };
      for (let i = 1; i <= 40; i++) {
        const key = `Prod_${i}`;
        base[key] = r[key] != null ? Number(r[key]) : null;
      }
      return base as any;
    });
    return repo.save(entities as any[]);
  }

  async countRelatorioByFile(processedFile: string) {
    await this.init();
    const repo = this.ds.getRepository(Relatorio);
    return repo.count({ where: { processedFile } });
  }

  async getLastRelatorioTimestamp(processedFile: string) {
    await this.init();
    const repo = this.ds.getRepository(Relatorio);
    const qb = repo.createQueryBuilder('r').where('r.processedFile = :f', { f: processedFile }).orderBy('r.Dia', 'DESC').addOrderBy('r.Hora', 'DESC').limit(1);
    const found = await qb.getOne();
    if (!found) return null;
    return { Dia: found.Dia || null, Hora: found.Hora || null };
  }

  async deleteRelatorioByFile(processedFile: string) {
    await this.init();
    const repo = this.ds.getRepository(Relatorio);
    const items = await repo.find({ where: { processedFile } });
    if (items.length === 0) return 0;
    const ids = items.map((i: any) => i.id);
    await repo.delete(ids);
    return ids.length;
  }

  async syncSchema(): Promise<void> {
    await this.init();
    console.log('Synchronizing database schema...');
    await this.ds.synchronize();
    console.log('Database schema synchronized.');
  }
}

const dbService = new DBService();

// backward-compatible exports (functions)
export const AppDataSource = dbService.ds;
export async function initDb() { return dbService.init(); }
export async function insertRelatorioRows(rows: any[], processedFile: string) { return dbService.insertRelatorioRows(rows, processedFile); }
export async function countRelatorioByFile(processedFile: string) { return dbService.countRelatorioByFile(processedFile); }
export async function getLastRelatorioTimestamp(processedFile: string) { return dbService.getLastRelatorioTimestamp(processedFile); }
export async function deleteRelatorioByFile(processedFile: string) { return dbService.deleteRelatorioByFile(processedFile); }
export function isMysqlConfigured() { return useMysql; }
export { dbService as default };
