import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbook = path.join(root, 'source/KimyoLab_v20_nazariya_amaliyot_mapping.xlsx');

test('XLSX reader resolves workbook sheet names and baseline rows', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'src/domain/content/xlsx-reader.ts')).href);
  const sheets = mod.readWorkbookSheets(workbook);
  assert.deepEqual(Object.keys(sheets), ['Nazariya-Amaliyot', 'Amaliyot-Nazariya', 'Qamrov-xulosa', 'Metodika']);
  assert.equal(sheets['Nazariya-Amaliyot'].length, 126);
  assert.equal(sheets['Amaliyot-Nazariya'].length, 66);
  assert.equal(sheets['Nazariya-Amaliyot'][3][2], 'Nazariya ID');
  assert.equal(sheets['Nazariya-Amaliyot'][4][2], '7.01');
  assert.equal(sheets['Amaliyot-Nazariya'][3][2], 'Amaliy ID');
  assert.equal(sheets['Amaliyot-Nazariya'][4][2], '7.1');
});

test('XLSX importer writes normalized migration snapshot with 122 theory and 62 practice rows', () => {
  const output = path.join(root, 'reports/xlsx-import-snapshot.json');
  fs.rmSync(output, { force: true });
  const r = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/import-xlsx.ts', workbook], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `import failed:\n${r.stdout}\n${r.stderr}`);
  assert.equal(fs.existsSync(output), true);
  const snapshot = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(snapshot.theory.length, 122);
  assert.equal(snapshot.practices.length, 62);
  assert.equal(snapshot.theory[0].legacyId, '7.01');
  assert.equal(snapshot.practices[0].legacyId, '7.1');
  assert.equal(snapshot.practices.at(-2).legacyId, '11.1');
});
