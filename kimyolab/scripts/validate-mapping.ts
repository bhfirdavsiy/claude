import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCanonicalData } from '../src/domain/content/validate.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(root, 'content-src', name), 'utf8'));

const result = validateCanonicalData({
  concepts: read('concepts.json'),
  learningUnits: read('learning-units.json'),
  theoryActivities: read('theory-activities.json'),
  practiceActivities: read('practice-activities.json'),
  mappingLinks: read('mapping-links.json'),
});

const reportDir = path.join(root, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'mapping-validation.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  ...result,
}, null, 2)}\n`, 'utf8');

const failures = Object.values(result.gate).reduce((a,b) => a + b, 0);
console.log(JSON.stringify(result.gate));
if (failures > 0) process.exitCode = 1;
