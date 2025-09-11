import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'fast-csv';

const tmpDir = path.resolve(process.cwd(), process.env.COLLECTOR_TMP || 'tmp');
const processedDir = path.join(tmpDir, 'processed');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

/**
 * Row returned by the parser.
 */
export interface ParserRow {
	/** ISO datetime string */
	datetime: string;
	label?: string | null;
	group?: number | null;
	flag?: number | null;
	form1?: number | null;
	form2?: number | null;
	values: Array<number | null>;
}

/**
 * Result returned by parser when processing a file.
 */
export interface ParserResult {
	processedPath: string;
	rowsCount: number;
	rows: ParserRow[];
}

function parseDateTime(dateStr: string, timeStr: string) {
	if (!dateStr || !timeStr) return new Date();
	const parts = dateStr.split('/');
	const d = parts[0] || '01';
	const m = parts[1] || '01';
	const y = parts[2] || '00';
	const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
	return new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timeStr}`);
}

/**
 * ParserService - reads a CSV file and normalizes rows to a consistent shape.
 *
 * - Detects delimiter (`,` or `;`).
 * - Detects presence of headers and maps named columns to standard fields.
 * - Produces an array of ParserRow with ISO datetimes and numeric values (or null).
 */
class ParserService {
	/** Parse a CSV file and write a JSON processed file into `tmp/processed` (collector tmp). */
	processFile(filePath: string): Promise<ParserResult> {
		return new Promise((resolve, reject) => {
			const rows: ParserRow[] = [];
			let firstLine = '';
			try {
				const raw = fs.readFileSync(filePath, 'utf8');
				firstLine = raw.split(/\r?\n/)[0] || '';
			} catch (e) {
				return reject(e);
			}

			const delim = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
			const hasHeader = /date|time|label|group|flag/i.test(firstLine);

			fs.createReadStream(filePath)
				.pipe(parse({ headers: hasHeader, trim: true, delimiter: delim }))
				.on('error', (err: unknown) => reject(err))
				.on('data', (row: any) => {
					try {
						let dateStr: string | undefined;
						let timeStr: string | undefined;
						let label: string | undefined;
						let group: any;
						let flag: any;
						let form1: number | null = null;
						let form2: number | null = null;
						const values: Array<number | null> = [];
						if (hasHeader) {
							dateStr = row['date'] || row['Date'];
							timeStr = row['time'] || row['Time'];
							label = row['label'] || row['Label'];
							group = row['group'] || row['Group'];
							flag = row['flag'] || row['Flag'];
							// also support explicit form1/form2 columns; don't mix them into values
							const form1Val = row['form1'] || row['Form1'] || row['Form_1'] || row['Form1'];
							const form2Val = row['form2'] || row['Form2'] || row['Form_2'] || row['Form2'];
							for (const k of Object.keys(row)) {
								if (/^(date|time|label|group|flag|form1|form2|form_1|form_2)$/i.test(k)) continue;
								const n = Number(row[k]);
								values.push(Number.isNaN(n) ? null : n);
							}
							if (form1Val != null && form1Val !== '') {
								// normalize numeric
								const n = Number(form1Val);
								form1 = Number.isNaN(n) ? null : n;
							}
							if (form2Val != null && form2Val !== '') {
								const n2 = Number(form2Val);
								form2 = Number.isNaN(n2) ? null : n2;
							}
						} else {
							dateStr = row[0];
							timeStr = row[1];
							label = row[2];
							// columns 4 and 5 (zero-based 3 and 4) are form1 and form2 per spec
							form1 = row[3] != null && row[3] !== '' ? (Number.isNaN(Number(row[3])) ? null : Number(row[3])) : null;
							form2 = row[4] != null && row[4] !== '' ? (Number.isNaN(Number(row[4])) ? null : Number(row[4])) : null;
							for (let i = 5; i < row.length; i++) {
								const n = Number(row[i]);
								values.push(Number.isNaN(n) ? null : n);
							}
						}
						const datetime = parseDateTime(dateStr as any, timeStr as any);
						rows.push({ datetime: datetime.toISOString(), label: label || null, group: group ? Number(group) : null, flag: flag ? Number(flag) : null, form1: form1 != null ? form1 : null, form2: form2 != null ? form2 : null, values });
					} catch (e) {
						// ignore individual row errors
					}
				})
				.on('end', () => {
					if (!hasHeader && rows.length > 0) rows.shift();
					const base = path.basename(filePath);
					const outName = base + '.json';
					const outPath = path.join(processedDir, outName);
					fs.writeFileSync(outPath, JSON.stringify({ source: base, rows }, null, 2));
					resolve({ processedPath: outPath, rowsCount: rows.length, rows });
				});
		});
	}
}

const parserService = new ParserService();
export default parserService;
export const processFile = (filePath: string) => parserService.processFile(filePath);
