// Verifies every asset in src/assets.manifest.json against the read-only originals
// in the repository-root public/ folder (existence, byte size, SHA-256).
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'src/assets.manifest.json'), 'utf8'));
const publicRoot = resolve(root, manifest.publicRoot);

const entries = [...manifest.covers, ...manifest.examples, ...manifest.referenceOnly];
let failures = 0;
for (const a of entries) {
  const abs = resolve(publicRoot, a.file);
  if (!existsSync(abs)) {
    console.error(`MISSING  ${a.file}`);
    failures++;
    continue;
  }
  const sha = createHash('sha256').update(readFileSync(abs)).digest('hex');
  const sizeOk = a.bytes === undefined || statSync(abs).size === a.bytes;
  const ok = sha === a.sha256 && sizeOk;
  if (!ok) failures++;
  console.log(`${ok ? 'OK      ' : 'MISMATCH'} ${a.file}`);
}
console.log(`\n${entries.length - failures}/${entries.length} assets verified (public root: ${publicRoot})`);
if (failures) process.exit(1);
