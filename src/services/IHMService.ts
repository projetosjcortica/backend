import { Client, FileType } from 'basic-ftp';
import * as path from 'path';
import * as fs from 'fs';
import backupService from './backupService';
import { computeHashSync } from '../utils/hash';

export default class IHMService {
  IP: string;
  user: string;
  password: string;
  client: Client;
  constructor(IP: string, user: string, password: string) {
    this.IP = IP;
    this.user = user;
    this.password = password;
    this.client = new Client();
    this.client.ftp.verbose = true;
  }

  // Cached compiled patterns and memoization map for quick lookup
  private static compiledPatterns: RegExp[] | null = null;
  private static memoizedExcluded: Map<string, boolean> = new Map();
  // In-memory cache storing remote file info (size, hash)
  private static fileCache: Map<string, { size: number; hash?: string }> = new Map();

  // Programmatically set override patterns (useful for tests)
  static setExcludePatterns(rawPatterns: string | null) {
    if (rawPatterns === null) {
      this.compiledPatterns = null;
      this.memoizedExcluded.clear();
      return;
    }
    const userRegexes = (rawPatterns || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        try { return new RegExp(s, 'i'); } catch (e) { return null; }
      })
      .filter(Boolean) as RegExp[];
    const defaults: RegExp[] = [/_sys/i, /^Relatorio_\d{2}_\d{2}(_sys)?\.csv$/i, /^Relatorio_\d{1,2}\.csv$/i];
    this.compiledPatterns = [...userRegexes, ...defaults];
    this.memoizedExcluded.clear();
  }

  // Determine if a remote filename should be excluded (system backups)
  // Uses memoization (hash table) so repeated checks are O(1).
  static isExcludedFile(name: string) {
    if (this.memoizedExcluded.has(name)) return this.memoizedExcluded.get(name)!;
    // Priority rules:
    // 1) If name ends with _01.csv => required (do not exclude)
    // 2) If name ends with _02.csv => backup (exclude)
    // 3) If name contains _SYS (any case) => backup (exclude)
    // 4) Otherwise fall back to compiled patterns
    const lower = name.toLowerCase();
    // files that explicitly end with _01.csv are always included
    if (/_01\.csv$/i.test(lower)) {
      this.memoizedExcluded.set(name, false);
      return false;
    }
    if (/_02\.csv$/i.test(lower) || /_sys/i.test(lower)) {
      this.memoizedExcluded.set(name, true);
      return true;
    }
    if (!this.compiledPatterns) {
      // lazy init from env if not set programmatically
      const raw = process.env.IHM_EXCLUDE_REGEX || '';
      this.setExcludePatterns(raw);
    }
    const patterns = this.compiledPatterns || [];
    let excluded = false;
    for (const r of patterns) {
      if (r.test(name)) {
        excluded = true;
        break;
      }
    }
    this.memoizedExcluded.set(name, excluded);
    return excluded;
  }

  async getArc(localDir: string) {
    const remoteDir = '/InternalStorage/data/';
    try {
      await this.client.access({ host: this.IP, user: this.user, password: this.password });
      console.log(`Navegando para o diretório remoto: ${remoteDir}`);
      await this.client.cd(remoteDir);
      const fileList = await this.client.list();
      console.log('Arquivos encontrados:', fileList.map(f => f.name));
      let csvFiles = fileList.filter(item => item.type === FileType.File && item.name.toLowerCase().endsWith('.csv'));
      // filter out system backups according to patterns
      csvFiles = csvFiles.filter(f => {
        if (IHMService.isExcludedFile(f.name)) {
          console.log('Excluding system/backup file from download:', f.name);
          return false;
        }
        return true;
      });
      if (csvFiles.length === 0) {
        console.error('Nenhum arquivo .csv encontrado no diretório remoto.');
        return null;
      }
  // Do not rely on remote MDTM; choose a file deterministically (by name descending)
  csvFiles.sort((a, b) => b.name.localeCompare(a.name));
  const selected = csvFiles[0];
  if (!selected) {
    console.error('Nenhum arquivo selecionado para download.');
    return null;
  }
  const selectedFile = selected.name;
      const localPath = path.join(localDir, selectedFile);
      console.log(`Baixando o arquivo mais recente: ${selectedFile}`);
      await this.client.downloadTo(localPath, selectedFile);
      console.log(`Arquivo ${selectedFile} baixado com sucesso!`);
      return { success: true, file: selectedFile, localPath };
    } catch (error: any) {
      if (error.code === 'ETIMEDOUT') {
        console.error('Erro: Conexão com o servidor FTP expirou (timeout).');
        throw new Error('Não foi possível conectar ao servidor FTP: tempo esgotado.');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('Erro: Conexão recusada pelo servidor.');
        throw new Error('Conexão recusada pelo servidor FTP.');
      } else {
        console.error('Erro ao baixar arquivo:', error);
        throw new Error('Erro inesperado ao baixar arquivo.');
      }
    } finally {
      this.client.close();
    }
  }

  /**
   * Find remote CSVs that appear to be new according to multiple heuristics
   * (name patterns, MDTM if available, and size changes) and download them to
   * the provided localDir. Returns an array of downloaded file info.
   *
   * processedSet (optional) is a Set<string> of base filenames already processed
   * so we can avoid downloading them again.
   */
  async findAndDownloadNewFiles(localDir: string, processedSet?: Set<string>) {
    const remoteDir = '/InternalStorage/data/';
    const downloaded: Array<{ name: string; localPath: string }> = [];
    try {
      await this.client.access({ host: this.IP, user: this.user, password: this.password });
      await this.client.cd(remoteDir);
      const fileList = await this.client.list();
      let csvFiles = fileList.filter(item => item.type === FileType.File && item.name.toLowerCase().endsWith('.csv'));
      // filter out system backups according to patterns
      csvFiles = csvFiles.filter(f => !IHMService.isExcludedFile(f.name));
      // Do not rely on remote MDTM or local cache; decision about new rows will be
      // made by the parser/collector using dates inside the CSV content.
      // We'll download all files that are not in the processedSet.
      csvFiles.sort((a, b) => a.name.localeCompare(b.name));

      for (const file of csvFiles) {
        const base = file.name;
        if (processedSet && processedSet.has(base)) continue;

        // Try to get remote size (bytes) before downloading; if available and matches cache, skip download
        let remoteSize: number | null = null;
        try {
          // basic-ftp provides size(name)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (typeof (this.client as any).size === 'function') {
            // some servers may reject SIZE; wrap in try/catch
            try {
              const s = await (this.client as any).size(base);
              remoteSize = typeof s === 'number' ? s : Number(s || 0);
            } catch (e) {
              remoteSize = null;
            }
          }
        } catch (e) {
          remoteSize = null;
        }

        const cached = IHMService.fileCache.get(base);
        if (remoteSize != null && cached && cached.size === remoteSize) {
          // Remote file size equals cached size -> assume identical, skip download
          console.log('Remote file size matches cache, skipping download:', base);
          continue;
        }

        const localPath = path.join(localDir, base);
        try {
          await this.client.downloadTo(localPath, base);
          // compute hash and update in-memory cache
          try {
            const hash = computeHashSync(localPath, 'sha256');
            const finalSize = remoteSize != null ? remoteSize : (fs.existsSync(localPath) ? fs.statSync(localPath).size : 0);
            if (hash && typeof hash === 'string') {
              IHMService.fileCache.set(base, { size: finalSize, hash });
            } else {
              IHMService.fileCache.set(base, { size: finalSize });
            }
          } catch (hErr) {
            // if hashing fails, still store size
            try {
              const finalSize = fs.existsSync(localPath) ? fs.statSync(localPath).size : (remoteSize != null ? remoteSize : 0);
              IHMService.fileCache.set(base, { size: finalSize });
            } catch (e) { /* ignore */ }
          }
          downloaded.push({ name: base, localPath });
        } catch (err) {
          console.warn(`Failed to download ${base}`, err);
        }
      }
      return downloaded;
    } catch (error: any) {
      // normalize error messages
      throw new Error('Erro buscando arquivos no IHM: ' + (error && error.message ? error.message : String(error)));
    } finally {
      this.client.close();
    }
  }

  /**
   * List candidate CSV files that likely need to be downloaded/processed.
   * Uses the FTP LIST response (ls -l) to obtain remote sizes and compares
   * against the in-memory cache to decide if a file changed.
   */
  async listCandidateFiles(processedSet?: Set<string>) {
    const remoteDir = '/InternalStorage/data/';
    try {
      await this.client.access({ host: this.IP, user: this.user, password: this.password });
      await this.client.cd(remoteDir);
      const fileList = await this.client.list();
      let csvFiles = fileList.filter(item => item.type === FileType.File && item.name.toLowerCase().endsWith('.csv'));
      csvFiles = csvFiles.filter(f => !IHMService.isExcludedFile(f.name));
      const candidatesAll: Array<{ name: string; size: number; modifiedAtTs: number }> = [];
      for (const f of csvFiles) {
        const base = f.name;
        if (processedSet && processedSet.has(base)) continue;
        const sizeNum = typeof f.size === 'number' ? f.size : Number(f.size || 0);
        const cached = IHMService.fileCache.get(base);
        // if cache matches remote size, skip
        if (cached && cached.size === sizeNum) continue;

        // if latest backup exists and its size matches remote size, populate cache from backup and skip
        try {
          const latest = backupService.getLatestBackup(base);
          if (latest && latest.backupPath && fs.existsSync(latest.backupPath)) {
            const stat = fs.statSync(latest.backupPath);
            const backupSize = stat.size;
            if (backupSize === sizeNum) {
              try {
                const bh = computeHashSync(latest.backupPath, 'sha256');
                if (bh) IHMService.fileCache.set(base, { size: backupSize, hash: bh });
                else IHMService.fileCache.set(base, { size: backupSize });
              } catch (e) {
                IHMService.fileCache.set(base, { size: backupSize });
              }
              continue;
            }
          }
        } catch (e) {
          // ignore backup errors and fall through to candidate
        }

        const modifiedAtTs = f.modifiedAt instanceof Date ? f.modifiedAt.getTime() : 0;
        candidatesAll.push({ name: base, size: sizeNum, modifiedAtTs });
      }

      // sort by modifiedAt desc (newest first), then size desc, then name
      candidatesAll.sort((a, b) => {
        if (b.modifiedAtTs !== a.modifiedAtTs) return b.modifiedAtTs - a.modifiedAtTs;
        if (b.size !== a.size) return b.size - a.size;
        return a.name.localeCompare(b.name);
      });

      // Apply thinning: keep at most IHM_MAX_CANDIDATES and ensure a min gap between selected items
      const maxCandidates = Number(process.env.IHM_MAX_CANDIDATES || 5);
      const minGap = Number(process.env.IHM_MIN_GAP_MS || 120000); // default 2 minutes
      const selected: Array<{ name: string; size: number }> = [];
      let lastSelectedTs = 0;
      for (const c of candidatesAll) {
        if (selected.length >= maxCandidates) break;
        if (selected.length === 0) {
          selected.push({ name: c.name, size: c.size });
          lastSelectedTs = c.modifiedAtTs;
          continue;
        }
        // if timestamps available, require minGap, otherwise accept until maxCandidates
        if (c.modifiedAtTs === 0 || lastSelectedTs === 0) {
          selected.push({ name: c.name, size: c.size });
          lastSelectedTs = c.modifiedAtTs;
        } else {
          if (Math.abs(lastSelectedTs - c.modifiedAtTs) >= minGap) {
            selected.push({ name: c.name, size: c.size });
            lastSelectedTs = c.modifiedAtTs;
          }
        }
      }
      const candidates = selected;
      return candidates;
    } catch (error: any) {
      throw new Error('Erro listando arquivos no IHM: ' + (error && error.message ? error.message : String(error)));
    } finally {
      this.client.close();
    }
  }

  /** Download a single remote file and update the in-memory cache (size+hash). */
  async downloadFile(name: string, localDir: string) {
    const remoteDir = '/InternalStorage/data/';
    try {
      await this.client.access({ host: this.IP, user: this.user, password: this.password });
      await this.client.cd(remoteDir);
      const localPath = path.join(localDir, name);
      await this.client.downloadTo(localPath, name);
      // update cache
      try {
        const hash = computeHashSync(localPath, 'sha256');
        const size = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0;
        if (hash && typeof hash === 'string') IHMService.fileCache.set(name, { size, hash });
        else IHMService.fileCache.set(name, { size });
      } catch (e) {
        try { const size = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0; IHMService.fileCache.set(name, { size }); } catch (e2) { /* ignore */ }
      }
      return { localPath, name };
    } catch (error: any) {
      throw new Error('Erro baixando arquivo no IHM: ' + (error && error.message ? error.message : String(error)));
    } finally {
      this.client.close();
    }
  }

  // Try common FTP hash commands (server dependant). Returns { alg, hash } or null.
  private async getRemoteHash(name: string): Promise<{ alg: string; hash: string } | null> {
    const candidates: Array<{ cmd: string; alg: string }> = [
      { cmd: 'XMD5', alg: 'md5' },
      { cmd: 'MD5', alg: 'md5' },
      { cmd: 'XSHA1', alg: 'sha1' },
      { cmd: 'XCRC', alg: 'crc' },
      { cmd: 'HASH', alg: 'unknown' },
    ];
    for (const c of candidates) {
      try {
        // send raw command; some servers reply with the hash in the message
        // basic-ftp exposes `send` on the client. Use (this.client as any).send to avoid types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyClient: any = this.client as any;
        if (typeof anyClient.send !== 'function') continue;
        const res = await anyClient.send(`${c.cmd} ${name}`);
        if (!res) continue;
        const txt = String(res).trim();
        // attempt to extract hex-like token
        const m = txt.match(/([0-9a-fA-F]{16,128})/);
        if (m && m[1]) {
          return { alg: c.alg, hash: m[1].toLowerCase() };
        }
      } catch (e) {
        // ignore and try next
      }
    }
    return null;
  }

  private computeFileHashSync(filePath: string, alg: string) {
  // deprecated - use utils/hash.computeHashSync
  if (!fs.existsSync(filePath)) return null as any;
  return computeHashSync(filePath, alg === 'unknown' ? 'sha256' : (alg === 'crc' ? 'sha256' : alg));
  }

  async getDir(local: string, remote: string) {
    try {
      await this.client.access({ host: this.IP, user: this.user, password: this.password });
      await this.client.downloadToDir(local, remote);
      return { success: true };
    } catch (error: any) {
      if (error.code === 'ETIMEDOUT') {
        console.error('Erro: Conexão com o servidor FTP expirou (timeout).');
        throw new Error('Timeout de conexão FTP.');
      } else {
        console.error('Erro ao baixar diretório:', error);
        throw new Error('Erro ao baixar diretório.');
      }
    } finally {
      this.client.close();
    }
  }
}