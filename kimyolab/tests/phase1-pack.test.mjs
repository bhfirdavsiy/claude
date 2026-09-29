import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('content pack builder creates versioned manifest, grade chunks, and valid checksums', () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/build-content-pack.ts'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `pack build failed:\n${r.stdout}\n${r.stderr}`);

  const pointer = JSON.parse(fs.readFileSync(path.join(root, 'public/content/manifest.json'), 'utf8'));
  assert.equal(pointer.activeVersion, '2026.09.1');
  const packDir = path.join(root, 'public/content', pointer.activeVersion);
  const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.contentVersion, '2026.09.1');
  assert.deepEqual(manifest.grades, [7,8,9,10,11]);
  assert.ok(manifest.files.length >= 10);

  let totalUnits = 0;
  for (const grade of manifest.grades) {
    const units = JSON.parse(fs.readFileSync(path.join(packDir, `learning-units/grade-${grade}.json`), 'utf8'));
    assert.ok(units.every((x) => x.grade === grade));
    totalUnits += units.length;
  }
  assert.equal(totalUnits, 122);

  for (const entry of manifest.files) {
    const file = path.join(packDir, entry.path);
    assert.equal(fs.existsSync(file), true, `missing packed file ${entry.path}`);
    assert.equal(sha256(file), entry.checksum, `checksum mismatch ${entry.path}`);
    assert.equal(fs.statSync(file).size, entry.size, `size mismatch ${entry.path}`);
  }
});

test('content pack checksum is deterministic across repeated legacy migration runs', () => {
  const run = (script) => spawnSync(process.execPath, ['--experimental-strip-types', script], { cwd: root, encoding: 'utf8' });
  assert.equal(run('scripts/migrate-legacy.ts').status, 0);
  assert.equal(run('scripts/build-content-pack.ts').status, 0);
  const first = JSON.parse(fs.readFileSync(path.join(root, 'public/content/manifest.json'), 'utf8'));
  const firstManifestFile = path.join(root, 'public/content', first.activeVersion, 'manifest.json');
  const firstManifestHash = sha256(firstManifestFile);

  spawnSync('sleep', ['0.05']);
  assert.equal(run('scripts/migrate-legacy.ts').status, 0);
  assert.equal(run('scripts/build-content-pack.ts').status, 0);
  const second = JSON.parse(fs.readFileSync(path.join(root, 'public/content/manifest.json'), 'utf8'));
  const secondManifestFile = path.join(root, 'public/content', second.activeVersion, 'manifest.json');
  const secondManifestHash = sha256(secondManifestFile);
  const manifest = JSON.parse(fs.readFileSync(secondManifestFile, 'utf8'));

  assert.equal(second.checksum, first.checksum, 'same canonical content version must build to the same content checksum');
  assert.equal(secondManifestHash, firstManifestHash, 'same canonical content must build to a byte-identical runtime manifest');
  assert.equal(manifest.createdAt, '2026-09-22T00:00:00.000Z');
  assert.equal(manifest.files.some((x) => x.path === 'migration-report.json'), false, 'diagnostic migration report must not be runtime content');
});
