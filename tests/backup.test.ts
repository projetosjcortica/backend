import backupService from '../src/services/backupService';
import * as fs from 'fs';
import * as path from 'path';

test('backupService backups buffer and lists metadata', async () => {
  const content = Buffer.from('hello-backup');
  const file = { originalname: 'test.csv', buffer: content, mimetype: 'text/csv', size: content.length };
  const meta = await backupService.backupFile(file as any);
  expect(meta).toHaveProperty('storedName');
  expect(fs.existsSync(meta.backupPath)).toBeTruthy();
  expect(fs.existsSync(meta.workPath)).toBeTruthy();
  const list = backupService.listBackups();
  expect(list.some((m: any) => m.storedName === meta.storedName)).toBeTruthy();
  const restored = backupService.restoreToWork(meta.storedName);
  expect(fs.existsSync(restored)).toBeTruthy();
});
