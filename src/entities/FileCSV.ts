import * as fs from 'fs';
import parserService from '../services/parserService';

export default class FileCSV {
  filePath: string | null = null;
  rows: any[] = [];
  headers: string[] | null = null;
  // index by label for O(1) lookups
  private indexByLabel: Map<string, any[]> = new Map();

  constructor(filePath?: string) {
    if (filePath) this.filePath = filePath;
  }

  async load() {
    if (!this.filePath) throw new Error('filePath not set');
    this.rows = [];
    // delegate to parserService to normalize CSV formats
    const res: any = await parserService.processFile(this.filePath!);
    if (res && Array.isArray(res.rows)) {
      this.rows = res.rows.map((r: any) => ({
        date: r.date || null,
        time: r.time || null,
        label: r.label || r.Nome || null,
        group: r.group || null,
        flag: r.flag || null,
        values: r.values || [],
        datetime: r.datetime || null,
      }));
    }
    this.buildIndex();
    return { rows: this.rows.length };
  }

  toJSON() {
    return { headers: this.headers, rows: this.rows };
  }

  getRow(i: number) {
    return this.rows[i] || null;
  }

  // Rebuild index (useful if rows are mutated externally)
  buildIndex() {
    this.indexByLabel = new Map();
    for (const r of this.rows) {
      if (!r || !r.label) continue;
      const arr = this.indexByLabel.get(r.label) || [];
      arr.push(r);
      this.indexByLabel.set(r.label, arr);
    }
  }

  // Return all rows with the exact label (fast O(1) lookup via Map)
  findByLabel(label: string) {
    return this.indexByLabel.get(label) || [];
  }

  // Find the first row where label starts with prefix
  findFirstLabelLike(prefix: string) {
    for (const [label, arr] of this.indexByLabel.entries()) {
      if (label && label.startsWith(prefix)) return arr[0];
    }
    return null;
  }

  mapRows(fn: (row: any, idx: number) => any) {
    return this.rows.map(fn);
  }
}
