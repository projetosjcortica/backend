import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { setTimeout as wait } from 'timers/promises';
import IHMService from '../services/IHMService';
import parserService from '../services/parserService';
import backupService from '../services/backupService';
import FileCSV from '../entities/FileCSV';
import { saveBatch, initDb } from '../services/dbService';

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS || '60000');
const TMP_DIR = path.resolve(process.cwd(), process.env.COLLECTOR_TMP || 'tmp');
const PROCESSED_DIR = path.resolve(process.cwd(), process.env.PROCESSED_DIR || 'processed');
// Prefer explicit INGEST_URL, fall back to host literal. Ensure it includes a protocol so URL() parsing won't fail.
const rawServer = process.env.INGEST_URL || process.env.SERVER_URL || 'http://192.168.5.200';
export const SERVER_URL = rawServer.match(/^https?:\/\//i) ? rawServer : `http://${rawServer}`; // e.g. http://192.168.5.200
const INGEST_TOKEN = process.env.INGEST_TOKEN;

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

export function postJson(url: string, body: any, token?: string) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const data = JSON.stringify(body);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data).toString(),
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const opts: any = {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers,
      };

      const req = lib.request(opts, (res: any) => {
        let raw = '';
        res.on('data', (c: any) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ status: res.statusCode, body: raw });
          return reject(new Error(`POST ${url} failed ${res.statusCode}: ${raw}`));
        });
      });
      req.on('error', (err: any) => reject(err));
      req.write(data);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

let STOP = false;
export function stopCollector() {
  STOP = true;
}

// in-memory cache of processed files for quick membership tests (hash table semantics)
const processedFiles: Set<string> = new Set();

export async function startCollector() {
  const host = process.env.IHM_HOST || '192.168.5.200';
  const user = process.env.IHM_USER || 'anonymous';
  const password = process.env.IHM_PASS || '';

  if (!host) {
    console.error('IHM_HOST is not set. Collector will not start.');
    return;
  }

  console.log('Starting collector for IHM host', host, 'poll interval', POLL_INTERVAL);

  // warm-up processedFiles cache from processed directory markers
  try {
    const doneFiles = fs.readdirSync(PROCESSED_DIR).filter(f => f.endsWith('.done'));
    for (const d of doneFiles) processedFiles.add(d.replace(/\.done$/, ''));
  } catch (e) {
    // ignore
  }

  while (!STOP) {
    try {
      const ihm = new IHMService(host, user, password);
      const result: any = await ihm.getArc(TMP_DIR);
      if (!result) {
        // nothing to download
        // console.debug('No CSV found on IHM');
      } else {
        const downloadedPath: string = result.localPath;
        const base = path.basename(downloadedPath);
        const processedPath = path.join(PROCESSED_DIR, base + '.json');

        // if already processed, skip (use in-memory Set for O(1) checks)
        if (processedFiles.has(base)) {
          console.log('Already processed:', base);
        } else if (fs.existsSync(processedPath)) {
          // ensure cache matches disk state
          processedFiles.add(base);
          console.log('Already processed (disk):', base);
        } else {
          console.log('Processing', base);
            // parse/normalize via FileCSV (POO wrapper)
            const fileCsv = new FileCSV(downloadedPath);
            await fileCsv.load();
            const parsed = { processedPath: path.join(PROCESSED_DIR, base + '.json') };
            // write processed JSON
            fs.writeFileSync(parsed.processedPath, JSON.stringify({ source: base, rows: fileCsv.rows }, null, 2));

          // Backup processed JSON and original CSV AFTER processing
          try {
            // backup the processed JSON (work copy)
            await backupService.backupFile({ path: parsed.processedPath, originalname: base + '.processed.json', mimetype: 'application/json', size: fs.statSync(parsed.processedPath).size });
          } catch (bErr) {
            console.warn('Backup of processed JSON failed for', base, bErr);
          }
          try {
            // backup the original downloaded CSV
            await backupService.backupFile({ path: downloadedPath, originalname: base, mimetype: 'text/csv', size: fs.statSync(downloadedPath).size });
          } catch (bErr) {
            console.warn('Backup of original CSV failed for', base, bErr);
          }

          // read processed JSON
          let payload: any = null;
          try {
            const raw = fs.readFileSync((parsed as any).processedPath, 'utf8');
            payload = JSON.parse(raw);
          } catch (rerr) {
            console.error('Failed to read processed JSON for', base, rerr);
          }

          // persist to DB if configured, else POST to server if SERVER_URL provided
          if (process.env.DATABASE_PATH) {
            try {
              await initDb();
              const saved = await saveBatch({ source: 'ihm', fileName: base, fileTimestamp: new Date().toISOString(), rows: fileCsv.rows, meta: { original: downloadedPath } });
              console.log('Saved batch to DB', saved.id);
              const marker = path.join(PROCESSED_DIR, base + '.done');
              fs.writeFileSync(marker, new Date().toISOString());
              processedFiles.add(base);
            } catch (dberr) {
              console.error('Failed to save batch to DB', dberr);
            }
          } else if (payload && SERVER_URL) {
            try {
              const url = SERVER_URL.endsWith('/') ? SERVER_URL + 'ingest' : SERVER_URL + '/ingest';
              const resp = await postJson(url, payload, INGEST_TOKEN);
              console.log('Ingested', base, (resp as any).status);
              const marker = path.join(PROCESSED_DIR, base + '.done');
              fs.writeFileSync(marker, new Date().toISOString());
                processedFiles.add(base);
            } catch (sendErr) {
              console.error('Failed to POST processed batch for', base, sendErr);
            }
          } else {
            console.log('No ingestion target configured — processed file kept in', (parsed as any).processedPath);
          }
        }
      }
    } catch (err) {
      console.error('Collector loop error:', err);
    }

    // wait
    await wait(POLL_INTERVAL);
  }

  console.log('Collector stopped');
}
