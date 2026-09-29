import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runMigration() {
  return spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/migrate-legacy.ts'], {
    cwd: root,
    encoding: 'utf8',
  });
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

test('stable canonical ID helpers do not derive IDs from titles', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'src/domain/content/ids.ts')).href);
  assert.equal(mod.canonicalLearningUnitId('7.01'), 'lu.7.01');
  assert.equal(mod.canonicalTheoryId('7.01'), 'theory.7.01');
  assert.equal(mod.canonicalPracticeId('experiment', '7.1'), 'practice.experiment.7.1');
  assert.equal(mod.canonicalPracticeId('case', '7.01', true), 'practice.case.7.01.planned');
});

test('legacy migration generates canonical source with one primary mapping per learning unit', () => {
  const r = runMigration();
  assert.equal(r.status, 0, `migration failed:\n${r.stdout}\n${r.stderr}`);

  const units = readJson('content-src/learning-units.json');
  const theory = readJson('content-src/theory-activities.json');
  const practices = readJson('content-src/practice-activities.json');
  const mappings = readJson('content-src/mapping-links.json');
  const concepts = readJson('content-src/concepts.json');
  const aliasesYaml = fs.readFileSync(path.join(root, 'content-src/aliases.yaml'), 'utf8');

  assert.equal(units.length, 122);
  assert.equal(theory.length, 122);
  assert.ok(concepts.length >= 300, 'concept registry should migrate the legacy concept vocabulary');
  assert.ok(practices.length >= 61, 'real legacy practices plus planned gaps must migrate');

  const primary = mappings.filter((x) => x.role === 'primary' && x.required === true);
  assert.equal(primary.length, 122, 'every learning unit must have exactly one required primary practice mapping');
  assert.equal(new Set(primary.map((x) => x.learningUnitId)).size, 122);

  assert.equal(practices.some((x) => x.legacyIds?.includes('11.1')), false, '11.1 placeholder must not become a PracticeActivity');
  assert.match(aliasesYaml, /from: \"11\.1\"[\s\S]*reason: \"legacy-migration\"/, '11.1 must be explicitly reclassified in aliases/migration metadata');

  const allIds = [...units, ...theory, ...practices, ...mappings, ...concepts].map((x) => x.id);
  assert.equal(new Set(allIds).size, allIds.length, 'canonical IDs must be globally unique');

  assert.equal(Object.hasOwn(units[0], 'practiceActivityIds'), false);
  assert.equal(Object.hasOwn(units[0], 'theoryActivityIds'), false);
});
