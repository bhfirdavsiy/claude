import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from '../src/domain/content/schema-validator.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const pairs = [
  ['concepts.json', 'concept.schema.json'],
  ['learning-units.json', 'learning-unit.schema.json'],
  ['theory-activities.json', 'theory-activity.schema.json'],
  ['practice-activities.json', 'practice-activity.schema.json'],
  ['mapping-links.json', 'mapping-link.schema.json'],
] as const;

const errors: string[] = [];
let validatedRecords = 0;
for (const [dataName, schemaName] of pairs) {
  const data = readJson(path.join(root, 'content-src', dataName));
  const schema = readJson(path.join(root, 'schemas', schemaName));
  if (!Array.isArray(data)) {
    errors.push(`${dataName}:root-not-array`);
    continue;
  }
  data.forEach((record, index) => {
    validatedRecords++;
    errors.push(...validateAgainstSchema(schema, record, `${dataName}[${index}]`));
  });
}

const packPointer = path.join(root, 'public/content/manifest.json');
if (fs.existsSync(packPointer)) {
  const pointer = readJson(packPointer);
  const packManifestFile = path.join(root, 'public/content', pointer.activeVersion, 'manifest.json');
  if (fs.existsSync(packManifestFile)) {
    const manifest = readJson(packManifestFile);
    const schema = readJson(path.join(root, 'schemas/content-pack-manifest.schema.json'));
    validatedRecords++;
    errors.push(...validateAgainstSchema(schema, manifest, 'content-pack-manifest'));
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  validatedRecords,
  schemaErrors: errors.length,
  errors,
};
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/content-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ validatedRecords, schemaErrors: errors.length }));
if (errors.length) process.exitCode = 1;
