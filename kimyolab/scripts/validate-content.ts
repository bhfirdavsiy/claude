import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContentAjv, schemaIssues, validateCanonicalContent } from './lib/content-schema.ts';
import { activityRoutingReport, assessmentRuntimeReadiness } from './lib/runtime-readiness.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(root, 'schemas');
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

const {records, issues} = validateCanonicalContent(path.join(root, 'content-src'), schemaDir);
let validatedRecords = records;

const packPointer = path.join(root, 'public/content/manifest.json');
if (fs.existsSync(packPointer)) {
  const pointer = readJson(packPointer);
  const packManifestFile = path.join(root, 'public/content', pointer.activeVersion, 'manifest.json');
  if (fs.existsSync(packManifestFile)) {
    validatedRecords++;
    issues.push(...schemaIssues(createContentAjv(schemaDir), 'content-pack-manifest.schema.json', readJson(packManifestFile), 'content-pack-manifest', '$'));
  }
}

// Pedagogical debt that is not a schema violation (tracked for P2 pedagogical lint).
const practice = readJson(path.join(root, 'content-src/practice-activities.json')) as any[];
const warnings = practice.filter((x) => !x.conceptIds?.length).map((x) => `PRACTICE_WITHOUT_DIRECT_CONCEPTS:${x.id}`);

const byCode: Record<string, number> = {};
for (const issue of issues) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
const report = {
  generatedAt: new Date().toISOString(),
  validator: 'ajv-2020-12 (additionalProperties:false)',
  validatedRecords,
  schemaErrors: issues.length,
  byCode,
  errors: issues.map((x) => `${x.code}:${x.file}:${x.path}:${x.message}`),
  warnings,
};
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/content-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

// P1.1 (D8): canonical routing — exactly one execution plan per activity (build fails on conflicts).
const configDir = path.join(root, 'content-src/activity-configs');
const configs = Object.fromEntries(fs.readdirSync(configDir).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), readJson(path.join(configDir, f))]));
const routing = activityRoutingReport(practice, configs);
fs.writeFileSync(path.join(root, 'reports/activity-routing.json'), `${JSON.stringify({ generatedAt: report.generatedAt, ...routing }, null, 2)}\n`, 'utf8');
if (routing.fatal) { console.error(`ROUTING_INVALID: ${routing.fatal} fatal route error(s)`); process.exitCode = 1; }

// P1.1: assessment runtime readiness baseline for P1.2 (reporting only; C4 enforcement stays deferred).
const readiness = assessmentRuntimeReadiness(readJson(path.join(root, 'content-src/assessment-items.json')), readJson(path.join(root, 'content-src/learning-units.json')));
fs.writeFileSync(path.join(root, 'reports/assessment-runtime-readiness.json'), `${JSON.stringify({ generatedAt: report.generatedAt, ...readiness }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ routing: { ready: routing.ready, pending: routing.pending, disabled: routing.disabled }, assessment: { itemsRuntimeReady: readiness.itemsRuntimeReady, itemsBlocked: readiness.itemsBlocked } }));
console.log(JSON.stringify({ validatedRecords, schemaErrors: issues.length, byCode, warnings: warnings.length }));
if (issues.length) { for (const line of report.errors.slice(0, 40)) console.error(line); process.exitCode = 1; }
