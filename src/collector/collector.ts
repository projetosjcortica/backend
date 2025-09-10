import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { setTimeout as wait } from 'timers/promises';
import IHMService from '../services/IHMService';
import parserService from '../services/parserService';
import backupService from '../services/backupService';
import FileCSV from '../entities/FileCSV';
import { initDb, getLastRelatorioTimestamp, insertRelatorioRows, isMysqlConfigured, countRelatorioByFile } from '../services/dbService';

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS || '60000');
const TMP_DIR = path.resolve(process.cwd(), process.env.COLLECTOR_TMP || 'tmp');
const DOWNLOADS_DIR = path.resolve(process.cwd(), process.env.DOWNLOADS_DIR || 'downloads');
const PROCESSED_DIR = path.join(DOWNLOADS_DIR, 'processed');
// Prefer explicit INGEST_URL, fall back to host literal. Ensure it includes a protocol so URL() parsing won't fail.
const rawServer = process.env.INGEST_URL || process.env.SERVER_URL || 'http://192.168.5.200';
export const SERVER_URL = rawServer.match(/^https?:\/\//i) ? rawServer : `http://${rawServer}`; // e.g. http://192.168.5.200
const INGEST_TOKEN = process.env.INGEST_TOKEN;

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
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
      // ensure DB initialized once per loop start (no-op if already initialized)
      let dbEnabled = false;
      try {
        // initialize DB (required). We focus exclusively on writing to the DB — no HTTP fallback.
        await initDb();
        dbEnabled = true;
      } catch (e) {
        dbEnabled = false;
        console.error('DB initialization failed; collector will skip persistence until DB is available.', e);
      }
      const ihm = new IHMService(host, user, password);
      // ask IHM for multiple new files (skip those already processed)
      const downloads = await ihm.findAndDownloadNewFiles(TMP_DIR, processedFiles);
      if (!downloads || downloads.length === 0) {
        // nothing to download
      } else {
        for (const d of downloads) {
          const downloadedPath = d.localPath;
          const base = d.name;
          const processedPath = path.join(PROCESSED_DIR, base + '.json');

          // if already processed, skip (use in-memory Set for O(1) checks)
          if (processedFiles.has(base)) {
            console.log('Already processed:', base);
            continue;
          } else if (fs.existsSync(processedPath)) {
            // ensure cache matches disk state
            processedFiles.add(base);
            console.log('Already processed (disk):', base);
            continue;
          }

          console.log('Processing', base);
          // parse/normalize via FileCSV (POO wrapper)
          const fileCsv = new FileCSV(downloadedPath);
          await fileCsv.load();
          const allRows = fileCsv.rows || [];
          // read last processed timestamp from DB for this file
          let lastDb = null;
          try {
            lastDb = await getLastRelatorioTimestamp(base);
          } catch (e) {
            // ignore, will treat as full import
          }

          // process from bottom to top and collect only new rows after lastDb
          const newRows: any[] = [];
          // helper to compare timestamps. Prefer ISO `row.datetime` when available (from parserService).
          // Fallback to concatenating Dia+Hora or date+time when needed.
          function isAfter(row: any, last: any) {
            if (!last) return true;
            try {
              // prefer ISO datetime produced by parserService
              const rIso = row.datetime || null;
              const lDia = last.Dia || null;
              const lHora = last.Hora || null;
              let dt1: Date | null = null;
              let dt2: Date | null = null;
              if (rIso) dt1 = new Date(rIso);
              else if (row.date && row.time) dt1 = new Date(`${row.date}T${row.time}`);
              else if (row.Dia && row.Hora) dt1 = new Date(`${row.Dia}T${row.Hora}`);

              if (lDia && lHora) dt2 = new Date(`${lDia}T${lHora}`);

              if (dt1 && dt2) return dt1 > dt2;
              // if we cannot parse properly, be conservative and treat as new
              return true;
            } catch (e) {
              return true;
            }
          }

          for (let i = allRows.length - 1; i >= 0; i--) {
            const r = allRows[i];
            if (isAfter(r, lastDb)) {
              // map to relatorio-shaped object
              const mapped: any = {};
              mapped.Dia = r.date || r.Dia || null;
              mapped.Hora = r.time || r.Hora || null;
              mapped.Nome = r.label || r.Nome || null;
              // Form1/Form2 may be the first two values
              mapped.Form1 = Array.isArray(r.values) && r.values.length > 0 ? r.values[0] : (r.Form1 || r.form1 || null);
              mapped.Form2 = Array.isArray(r.values) && r.values.length > 1 ? r.values[1] : (r.Form2 || r.form2 || null);
              // processedFile marker
              mapped.processedFile = base;
              // map values to Prod_1..Prod_40
              if (Array.isArray(r.values)) {
                for (let j = 1; j <= 40; j++) mapped[`Prod_${j}`] = r.values[j - 1] != null ? r.values[j - 1] : null;
              }
              newRows.push(mapped);
            } else {
              // we've reached already-processed rows; stop
              break;
            }
          }

          // reverse newRows to maintain chronological order when inserting
          newRows.reverse();

          const parsed = { processedPath: path.join(PROCESSED_DIR, base + '.json') };
          // write processed JSON (full content)
          fs.writeFileSync(parsed.processedPath, JSON.stringify({ source: base, rows: allRows }, null, 2));

          // Backup processed JSON and original CSV AFTER processing
          try {
            // backup the processed JSON (copy stored under backups and a copy under downloads)
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

          // persist to DB if MySQL is configured and init succeeded. We require MySQL for new data inserts.
          if (dbEnabled) {
            try {
              if (newRows.length > 0) {
                // compute pre-count so we can report how many new rows were actually persisted
                let beforeCount = 0;
                try { beforeCount = await countRelatorioByFile(base); } catch (e) { /* ignore */ }
                // attempt with retries to avoid transient DB failures causing silent data loss
                const maxAttempts = 3;
                let attempt = 0;
                let lastErr: any = null;
                while (attempt < maxAttempts) {
                  attempt += 1;
                  try {
                    await insertRelatorioRows(newRows, base);
                    lastErr = null;
                    break;
                  } catch (e) {
                    lastErr = e;
                    const backoff = 200 * attempt;
                    console.warn(`DB insert attempt ${attempt} failed for ${base}, retrying in ${backoff}ms`, e);
                    await wait(backoff);
                  }
                }
                if (lastErr) throw lastErr;
                // count after insert and log delta
                try {
                  const afterCount = await countRelatorioByFile(base);
                  const inserted = Math.max(0, afterCount - beforeCount);
                  console.log(`Inserted ${inserted} rows into relatorio for ${base}`);
                } catch (e) {
                  console.warn('Could not determine inserted row count for', base, e);
                }
              }
              // mark processed (full) file as done so we don't reprocess only after successful DB insert or when there were no new rows
              const marker = path.join(PROCESSED_DIR, base + '.done');
              fs.writeFileSync(marker, new Date().toISOString());
              processedFiles.add(base);
            } catch (dberr) {
              // If DB insertion failed after retries, do NOT mark file as processed. Log and continue so next loop can retry.
              console.error('Failed inserting rows into DB for', base, dberr);
            }
          } else {
            // We operate exclusively with DB persistence. If DB isn't available we keep the processed JSON
            // for later reprocessing and DO NOT mark the file as done.
            if (!dbEnabled) {
              console.error('DB not available - skipping marking processed for', base);
            } else {
              console.log('Processed file kept in', (parsed as any).processedPath);
            }
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
