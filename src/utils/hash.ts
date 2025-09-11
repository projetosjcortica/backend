import * as fs from 'fs';
import * as crypto from 'crypto';

export function computeHashSync(filePath: string, alg = 'sha256') {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  const h = crypto.createHash(alg);
  h.update(buf);
  return h.digest('hex');
}

export function computeHashHex(buffer: Buffer, alg = 'sha256') {
  const h = crypto.createHash(alg);
  h.update(buffer);
  return h.digest('hex');
}
