import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const requiredSchemas = [
  'concept.schema.json',
  'learning-unit.schema.json',
  'theory-activity.schema.json',
  'practice-activity.schema.json',
  'mapping-link.schema.json',
  'content-pack-manifest.schema.json',
];

test('Phase 1 canonical JSON Schema contracts exist', () => {
  for (const name of requiredSchemas) {
    const file = path.join(root, 'schemas', name);
    assert.equal(fs.existsSync(file), true, `${name} must exist`);
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(schema.type, 'object');
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0, `${name} must declare required fields`);
  }
});

test('TypeScript canonical content contract exists and bans duplicate relation arrays on LearningUnit', () => {
  const file = path.join(root, 'src/domain/content/types.ts');
  assert.equal(fs.existsSync(file), true, 'types.ts must exist');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /export interface LearningUnit/);
  assert.match(text, /export interface MappingLink/);
  assert.doesNotMatch(text, /practiceActivityIds\s*:/, 'LearningUnit must not store duplicate practice relation arrays');
  assert.doesNotMatch(text, /theoryActivityIds\s*:/, 'LearningUnit must not store duplicate theory relation arrays');
});
