import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'content-src', name), 'utf8'));

test('canonical source passes Phase 1 validation gate', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'src/domain/content/validate.ts')).href);
  const result = mod.validateCanonicalData({
    concepts: read('concepts.json'),
    learningUnits: read('learning-units.json'),
    theoryActivities: read('theory-activities.json'),
    practiceActivities: read('practice-activities.json'),
    mappingLinks: read('mapping-links.json'),
  });

  assert.deepEqual(result.gate, {
    duplicateCanonicalIds: 0,
    unknownRefs: 0,
    forwardReverseMismatch: 0,
    schemaErrors: 0,
    orphanRequiredEntities: 0,
  });
  assert.equal(result.primaryMappings, 122);
});

test('validator rejects unknown practice reference and duplicate canonical ID', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'src/domain/content/validate.ts')).href);
  const data = {
    concepts: read('concepts.json'),
    learningUnits: read('learning-units.json'),
    theoryActivities: read('theory-activities.json'),
    practiceActivities: read('practice-activities.json').map((x) => ({...x})),
    mappingLinks: read('mapping-links.json').map((x) => ({...x})),
  };
  data.practiceActivities[1].id = data.practiceActivities[0].id;
  data.mappingLinks[0].practiceActivityId = 'practice.missing.404';
  const result = mod.validateCanonicalData(data);
  assert.ok(result.gate.duplicateCanonicalIds > 0);
  assert.ok(result.gate.unknownRefs > 0);
});

test('validation CLI writes machine-readable mapping report', () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/validate-mapping.ts'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `validator failed:\n${r.stdout}\n${r.stderr}`);
  const reportFile = path.join(root, 'reports/mapping-validation.json');
  assert.equal(fs.existsSync(reportFile), true);
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  assert.equal(report.gate.forwardReverseMismatch, 0);
  assert.equal(report.gate.unknownRefs, 0);
});

test('content validator evaluates canonical entities against JSON Schema documents', () => {
  const reportFile = path.join(root, 'reports/content-validation.json');
  fs.rmSync(reportFile, { force: true });
  const r = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/validate-content.ts'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `content validator failed:\n${r.stdout}\n${r.stderr}`);
  assert.equal(fs.existsSync(reportFile), true);
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  assert.equal(report.schemaErrors, 0);
  assert.ok(report.validatedRecords >= 500, 'validator should evaluate all canonical records');
});
