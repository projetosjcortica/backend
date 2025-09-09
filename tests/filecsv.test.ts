import FileCSV from '../src/entities/FileCSV';
import * as path from 'path';

test('FileCSV loads csv and exposes rows', async () => {
  const f = new FileCSV(path.resolve(__dirname, 'fixtures', 'sample.csv'));
  await f.load();
  expect(f.rows.length).toBe(23);
  expect(f.getRow(0)).toHaveProperty('label', 'Formula Nikkey');
});
