import backupService from './backupService';
import * as db from './dbService';
import * as path from 'path';
import * as fs from 'fs';

export interface NotifyPayload {
  filename: string;
  rows: any[]; // array of relatorio-shaped rows
  lastProcessedAt: string;
  rowCount: number;
  originalPath?: string;
}

export interface Observer {
  update(payload: NotifyPayload): Promise<void>;
}

class Subject {
  private observers: Set<Observer> = new Set();

  attach(o: Observer) { this.observers.add(o); }
  detach(o: Observer) { this.observers.delete(o); }
  async notify(payload: NotifyPayload) {
    const promises = Array.from(this.observers).map(o => o.update(payload).catch(e => {
      // eslint-disable-next-line no-console
      console.error('Observer error', e);
    }));
    await Promise.all(promises);
  }
}

class BackupObserver implements Observer {
  async update(payload: NotifyPayload) {
    // backup processed JSON (if present) and original CSV
    try {
      if (payload.originalPath && fs.existsSync(payload.originalPath)) {
        await backupService.backupFile({ path: payload.originalPath, originalname: payload.filename, mimetype: 'text/csv', size: fs.statSync(payload.originalPath).size });
      }
      // also backup processed JSON if exists under downloads/processed
      const downloadsDir = path.resolve(__dirname, '..', '..', 'downloads');
      const processedPath = path.join(downloadsDir, 'processed', payload.filename + '.json');
      if (fs.existsSync(processedPath)) {
        await backupService.backupFile({ path: processedPath, originalname: payload.filename + '.json', mimetype: 'application/json', size: fs.statSync(processedPath).size });
      }
    } catch (e) {
      // log and continue
      // eslint-disable-next-line no-console
      console.warn('BackupObserver failed', e);
    }
  }
}

class DbObserver implements Observer {
  async update(payload: NotifyPayload) {
    if (!payload.rows || payload.rows.length === 0) return;
    try {
      // insert rows into DB using existing db service
      await db.insertRelatorioRows(payload.rows, payload.filename);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('DbObserver failed', e);
    }
  }
}

class LogObserver implements Observer {
  async update(payload: NotifyPayload) {
    try {
      const downloadsDir = path.resolve(__dirname, '..', '..', 'downloads');
      const logPath = path.join(downloadsDir, 'process_logs.jsonl');
      const entry = { filename: payload.filename, time: payload.lastProcessedAt, rowCount: payload.rowCount };
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('LogObserver failed', e);
    }
  }
}

class NotifyService extends Subject {
  constructor() {
    super();
    // attach default observers
    this.attach(new BackupObserver());
    this.attach(new DbObserver());
    this.attach(new LogObserver());
  }
}

const notifyService = new NotifyService();
export default notifyService;
export const subject = notifyService; // backwards-compatible alias
