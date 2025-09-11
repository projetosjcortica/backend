import * as path from 'path';
import * as fs from 'fs';
import { setTimeout as wait } from 'timers/promises';
import IHMService from '../services/IHMService';
import fileProcessorService from '../services/fileProcessorService';
import { initDb } from '../services/dbService';

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS || '60000');
const TMP_DIR = path.resolve(process.cwd(), process.env.COLLECTOR_TMP || 'tmp');
// no processed markers: collector will download and delegate persistence to DB
// Prefer explicit INGEST_URL, fall back to host literal. Ensure it includes a protocol so URL() parsing won't fail.
const rawServer = process.env.INGEST_URL || process.env.SERVER_URL || 'http://192.168.5.200';
export const SERVER_URL = rawServer.match(/^https?:\/\//i) ? rawServer : `http://${rawServer}`; // e.g. http://192.168.5.200
const INGEST_TOKEN = process.env.INGEST_TOKEN;



if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

let STOP = false;
export function stopCollector() {
  STOP = true;
}

export async function startCollector() {
  const host = process.env.IHM_HOST || '192.168.5.200';
  const user = process.env.IHM_USER || 'anonymous';
  const password = process.env.IHM_PASS || '';

  if (!host) {
    console.error('IHM_HOST is not set. Collector will not start.');
    return;
  }

  console.log('Starting collector for IHM host', host, 'poll interval', POLL_INTERVAL);

  const ihmService = new IHMService(host, user, password);
  await initDb();

  while (!STOP) {
    try {
      const newFiles = await ihmService.findAndDownloadNewFiles(TMP_DIR);

      for (const file of newFiles) {
        if (STOP) break;
        console.log(`Processing file: ${file.localPath}`);
        const result = await fileProcessorService.processFile(file.localPath);
        console.log('Processing result:', result);

        if (result.insertedCount) {
          console.log(`Successfully inserted ${result.insertedCount} rows into the database.`);
        } else {
          console.warn(`No rows were inserted for file: ${file.localPath}`);
        }
      }
    } catch (error) {
      console.error('Error during collection cycle:', error);
    }

    await wait(POLL_INTERVAL);
  }

  console.log('Collector stopped.');
}
