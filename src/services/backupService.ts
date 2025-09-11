import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BACKUP_DIR = path.resolve(__dirname, '..', '..', 'backups');
const ENV_WORK_DIR = process.env.BACKUP_WORKDIR ? path.resolve(process.cwd(), process.env.BACKUP_WORKDIR) : null;

if (!fs.existsSync(DEFAULT_BACKUP_DIR)) fs.mkdirSync(DEFAULT_BACKUP_DIR, { recursive: true });
if (ENV_WORK_DIR && !fs.existsSync(ENV_WORK_DIR)) fs.mkdirSync(ENV_WORK_DIR, { recursive: true });

export interface BackupMeta {
  originalName: string;
  storedName: string;
  mimetype?: string | null;
  size?: number | null;
  backupPath: string;
  workPath?: string | null;
  timestamp: string;
}

class BackupService {
  dir: string;
  workdir: string | null;
  private metaCache: Map<string, BackupMeta> = new Map();

  constructor(dir = DEFAULT_BACKUP_DIR, workdir: string | null = ENV_WORK_DIR) {
    this.dir = dir;
    this.workdir = workdir;
    this.loadMetaCache();
  }

  /** Load existing metadata JSON files into the in-memory cache. */
  private loadMetaCache() {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(this.dir, f), 'utf8');
          const meta = JSON.parse(raw) as BackupMeta;
          if (meta && meta.storedName) this.metaCache.set(meta.storedName, meta);
        } catch (e) {
          // skip corrupt metadata file
        }
      }
    } catch (e) {
      // dir may not exist or be readable; ignore
    }
  }

  private writeMeta(meta: BackupMeta) {
    const metaPath = path.join(this.dir, meta.storedName + '.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    this.metaCache.set(meta.storedName, meta);
  }

  private makeTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  /**
   * Backup a file object (supports { path } or { buffer }).
   * Returns metadata about the stored backup.
   */
  async backupFile(file: { path?: string; buffer?: Buffer; originalname: string; mimetype?: string; size?: number }) {
    const ts = this.makeTimestamp();
    const storedName = `${ts}-${file.originalname}`;
    const backupPath = path.join(this.dir, storedName);
    let workPath: string | null = null;

    if (file.buffer) {
      fs.writeFileSync(backupPath, file.buffer);
      if (this.workdir) {
        workPath = path.join(this.workdir, storedName);
        fs.writeFileSync(workPath, file.buffer);
      }
    } else if (file.path) {
      fs.copyFileSync(file.path, backupPath);
      if (this.workdir) {
        workPath = path.join(this.workdir, storedName);
        fs.copyFileSync(file.path, workPath);
      }
    } else {
      throw new Error('Unsupported file object for backup');
    }

    const finalSize = file.size ?? (fs.existsSync(backupPath) ? fs.statSync(backupPath).size : null);
    const meta: BackupMeta = {
      originalName: file.originalname,
      storedName,
      mimetype: file.mimetype || null,
      size: typeof finalSize === 'number' ? finalSize : null,
      backupPath,
      workPath,
      timestamp: new Date().toISOString(),
    };

    this.writeMeta(meta);
    return meta;
  }

  listBackups() {
    return Array.from(this.metaCache.values()).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }

  getLatestBackup(originalName: string) {
    const all = this.listBackups();
    for (const m of all) {
      if (m.originalName === originalName || (m.storedName && m.storedName.endsWith(originalName))) return m;
    }
    return null;
  }

  getMeta(storedName: string) {
    return this.metaCache.get(storedName) || null;
  }

  restoreToWork(storedName: string) {
    const meta = this.getMeta(storedName);
    if (!meta) throw new Error('Backup not found');
    if (!this.workdir) throw new Error('No workdir configured for restore');
    const dest = path.join(this.workdir, meta.storedName);
    fs.copyFileSync(meta.backupPath, dest);
    return dest;
  }

  cleanup(keep = 10) {
    const all = this.listBackups();
    const toRemove = all.slice(keep);
    for (const m of toRemove) {
      try { fs.unlinkSync(m.backupPath); } catch (e) {}
      if (m.workPath) {
        try { fs.unlinkSync(m.workPath); } catch (e) {}
      }
      try { fs.unlinkSync(path.join(this.dir, m.storedName + '.json')); } catch (e) {}
      this.metaCache.delete(m.storedName);
    }
    return this.listBackups();
  }
}

export default new BackupService();
