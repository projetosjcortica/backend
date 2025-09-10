import * as path from 'path';
import * as fs from 'fs';
import { setTimeout as wait } from 'timers/promises';
import IHMService from '../services/IHMService';
import fileProcessorService from '../services/fileProcessorService';
import { initDb } from '../services/dbService';

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
      try { await initDb(); } catch (e) { /* continue, process will retry later */ }

      const ihm = new IHMService(host, user, password);
      const downloads = await ihm.findAndDownloadNewFiles(TMP_DIR, processedFiles);
      if (downloads && downloads.length > 0) {
        for (const d of downloads) {
          const downloadedPath = d.localPath;
          const base = d.name;
          const markerPath = path.join(PROCESSED_DIR, base + '.done');
          if (processedFiles.has(base) || fs.existsSync(markerPath)) { processedFiles.add(base); continue; }
          try {
            await fileProcessorService.processFile(downloadedPath);
            fs.writeFileSync(markerPath, new Date().toISOString());
            processedFiles.add(base);
            try { fs.unlinkSync(downloadedPath); } catch (e) { /* keep for debugging */ }
          } catch (e) {
            console.error('Failed processing file', base, e);
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
