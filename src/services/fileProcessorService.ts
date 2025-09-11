import parserService, { ParserRow, ParserResult } from './parserService';
import backupService from './backupService';
import * as db from './dbService';
import * as path from 'path';
import * as fs from 'fs';
import BaseService from './BaseService';

export type ProcessPayload = { filename: string; lastProcessedAt: string; rowCount: number };

export interface Observer {
  update(payload: ProcessPayload): Promise<void>;
}

class ProcessorSubject {
  private observers: Set<Observer> = new Set();

  attach(o: Observer) { this.observers.add(o); }
  detach(o: Observer) { this.observers.delete(o); }
  async notify(payload: ProcessPayload) {
    const promises = Array.from(this.observers).map(o => o.update(payload).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('Observer error', e);
    }));
    await Promise.all(promises);
  }
}

class BackupObserver implements Observer {
  async update(payload: ProcessPayload) {
    const candidates = [path.resolve(process.cwd(), 'downloads', payload.filename), path.resolve(process.cwd(), payload.filename)];
    let found: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) { found = c; break; }
    }
    if (!found) return;
    const fileStat = fs.statSync(found);
    const fileObj: any = { originalname: payload.filename, path: found, mimetype: 'text/csv', size: fileStat.size };
    await backupService.backupFile(fileObj);
  }
}

class CleanupObserver implements Observer {
  async update(payload: ProcessPayload) {
    const cnt = await db.countRelatorioByFile(payload.filename);
    if (cnt >= payload.rowCount) {
      const meta = backupService.listBackups().find((m: any) => m.originalName === payload.filename || m.storedName?.endsWith(payload.filename));
      if (meta) {
        const local = path.resolve(process.cwd(), 'downloads', payload.filename);
        if (fs.existsSync(local)) fs.unlinkSync(local);
      }
    }
  }
}

class FileProcessorService extends BaseService {
  private subject: ProcessorSubject;

  constructor() {
    super('FileProcessorService');
    this.subject = new ProcessorSubject();
    // attach default observers
    this.subject.attach(new BackupObserver());
    this.subject.attach(new CleanupObserver());
  }
  private mapRow(r: ParserRow | any): any {
    const base: any = {};
    // prefer canonical ParserRow shape (r.datetime)
    if (r.datetime) {
      try {
        const dt = new Date(r.datetime);
        base.Dia = `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear().toString().slice(-2)}`;
        base.Hora = dt.toTimeString().split(' ')[0];
      } catch (e) {
        base.Dia = r.date || r.Dia || r.DiaStr || null;
        base.Hora = r.time || r.Hora || null;
      }
    } else {
      base.Dia = r.date || r.Dia || r.DiaStr || null;
      base.Hora = r.time || r.Hora || null;
    }

    base.Nome = r.label || r.Nome || r.NomeStr || null;

    // Form1/Form2 may be present explicitly or as the first two numeric values
    const fv0 = Array.isArray(r.values) && r.values.length > 0 ? r.values[0] : null;
    const fv1 = Array.isArray(r.values) && r.values.length > 1 ? r.values[1] : null;
    base.Form1 = r.Form1 != null ? r.Form1 : (r.form1 != null ? r.form1 : (fv0 != null ? fv0 : null));
    base.Form2 = r.Form2 != null ? r.Form2 : (r.form2 != null ? r.form2 : (fv1 != null ? fv1 : null));

    if (Array.isArray(r.values) && r.values.length > 0) {
      for (let i = 1; i <= 40; i++) base[`Prod_${i}`] = r.values[i - 1] != null ? r.values[i - 1] : null;
    } else {
      for (let i = 1; i <= 40; i++) {
        const k = `Prod_${i}`;
        base[k] = r[k] != null ? r[k] : null;
      }
    }

    return base;
  }

  async processFile(fullPath: string) {
    const parsed: ParserResult = await parserService.processFile(fullPath as any);
    const rows: ParserRow[] = Array.isArray(parsed.rows) ? parsed.rows : [];
    let mapped = rows.map((r: any) => this.mapRow(r));

    // filter out completely empty rows (no Nome and no numeric data)
    mapped = mapped.filter((m: any) => {
      if (m.Nome) return true;
      if (m.Form1 != null || m.Form2 != null) return true;
      for (let i = 1; i <= 40; i++) {
        if (m[`Prod_${i}`] != null) return true;
      }
      return false;
    });
  // no debug logs in main branch

    const filename = path.basename(fullPath);
    const existing = await db.countRelatorioByFile(filename);
    if (existing > 0) return { skipped: true, reason: 'already processed', rowsCount: mapped.length };

    const inserted = await db.insertRelatorioRows(mapped, filename);

    const payload: ProcessPayload = { filename, lastProcessedAt: new Date().toISOString(), rowCount: mapped.length };
    await this.subject.notify(payload);

    return { processedPath: fullPath, rowsCount: mapped.length, insertedCount: Array.isArray(inserted) ? inserted.length : null };
  }

  attachObserver(o: Observer) { this.subject.attach(o); }
  detachObserver(o: Observer) { this.subject.detach(o); }
}

const fileProcessorService = new FileProcessorService();
export default fileProcessorService;
export { FileProcessorService };
