export function parseRowDateTime(row: any): Date | null {
  try {
    if (!row) return null;
    if (row.datetime) return new Date(row.datetime);
    const d = row.date || row.Dia || null;
    const t = row.time || row.Hora || null;
    if (!d || !t) return null;
    if (/\//.test(d)) {
      const parts = d.split('/');
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : new Date().getFullYear();
      return new Date(`${year}-${month}-${day}T${t}`);
    }
    return new Date(`${d}T${t}`);
  } catch (e) {
    return null;
  }
}
