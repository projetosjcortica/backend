import * as fs from 'fs';
import * as path from 'path';

const backupDir = path.resolve(__dirname, '..', '..', 'backups');
const workDir = path.resolve(__dirname, '..', '..', 'work');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

class BackupService {
  dir: string;
  work: string;
  // simple in-memory cache for listing metadata
  private metaCache: Map<string, any> = new Map();

  constructor(dir = backupDir, work = workDir) {
    this.dir = dir;
    this.work = work;
    this._loadMetaCache();
  }

  private _loadMetaCache() {
    try {
      const items = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      for (const m of items) {
        try {
          const content = fs.readFileSync(path.join(this.dir, m), 'utf8');
          const parsed = JSON.parse(content);
          this.metaCache.set(parsed.storedName, parsed);
        } catch (e) {
          // ignore corrupt
        }
      }
    } catch (e) {
      // ignore
    }
  }

  async backupFile(file: any) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${timestamp}-${file.originalname}`;
    const backupPath = path.join(this.dir, baseName);
    const workPath = path.join(this.work, baseName);
    if (file.buffer) {
      fs.writeFileSync(backupPath, file.buffer);
      fs.writeFileSync(workPath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, backupPath);
      fs.copyFileSync(file.path, workPath);
    } else {
      throw new Error('Unsupported file object');
    }
    const meta = {
      originalName: file.originalname,
      storedName: baseName,
      mimetype: file.mimetype,
      size: file.size || (file.buffer && file.buffer.length) || null,
      backupPath,
      workPath,
      timestamp: new Date().toISOString(),
    };
    const metaPath = path.join(this.dir, baseName + '.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    this.metaCache.set(baseName, meta);
    return meta;
  }

  listBackups() {
    return Array.from(this.metaCache.values()).sort((a: any, b: any) => (a.timestamp < b.timestamp ? 1 : -1));
  }

  getMeta(storedName: string) {
    return this.metaCache.get(storedName) || null;
  }

  restoreToWork(storedName: string) {
    const meta = this.getMeta(storedName);
    if (!meta) throw new Error('Backup not found');
    const src = meta.backupPath;
    const dest = path.join(this.work, meta.storedName);
    fs.copyFileSync(src, dest);
    return dest;
  }

  // cleanup older backups keeping `keep` latest
  cleanup(keep = 10) {
    const all = this.listBackups();
    const toRemove = all.slice(keep);
    for (const m of toRemove) {
      try {
        fs.unlinkSync(m.backupPath);
      } catch (e) {}
      try {
        fs.unlinkSync(m.workPath);
      } catch (e) {}
      try {
        fs.unlinkSync(path.join(this.dir, m.storedName + '.json'));
      } catch (e) {}
      this.metaCache.delete(m.storedName);
    }
    return this.listBackups();
  }
}

export default new BackupService();
