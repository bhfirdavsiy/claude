import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File, sha256Buffer } from '../src/domain/content/checksum.ts';
import { createActivationPointer } from '../src/runtime/compatibility/release-pointer.ts';
import { readReleasePointer, writeReleasePointerAtomic } from './release-pointer-io.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'content-src');

function parseSimpleYaml(file: string): Record<string,string> {
  const out: Record<string,string> = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('- ')) continue;
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    out[m[1]] = value;
  }
  return out;
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function copy(sourceFile: string, targetFile: string) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(sourceFile, targetFile);
}

const meta = parseSimpleYaml(path.join(source, 'manifest.yaml'));
const contentVersion = meta.contentVersion;
if (!contentVersion) throw new Error('CONTENT_VERSION_MISSING');
if (!meta.createdAt || !Number.isFinite(Date.parse(meta.createdAt))) throw new Error('CONTENT_CREATED_AT_INVALID');

const packRoot = path.join(root, 'public/content', contentVersion);
fs.rmSync(packRoot, { recursive: true, force: true });
fs.mkdirSync(packRoot, { recursive: true });

const units = JSON.parse(fs.readFileSync(path.join(source, 'learning-units.json'), 'utf8'));
const grades = [...new Set(units.map((x: any) => x.grade))].sort((a:any,b:any) => a-b);
for (const grade of grades) {
  writeJson(path.join(packRoot, `learning-units/grade-${grade}.json`), units.filter((x:any) => x.grade === grade));
}

for (const name of ['concepts.json','theory-activities.json','practice-activities.json','mapping-links.json','external-lab-bindings.json','learning-cycle.json','assessment-items.json']) {
  copy(path.join(source, name), path.join(packRoot, name));
}
copy(path.join(source, 'aliases.yaml'), path.join(packRoot, 'aliases.yaml'));


const activityConfigsSource = path.join(source, 'activity-configs');
const activityConfigsTarget = path.join(packRoot, 'activity-configs');
if (fs.existsSync(activityConfigsSource)) {
  fs.cpSync(activityConfigsSource, activityConfigsTarget, { recursive: true });
}

const chemistrySource = path.join(source, 'chemistry');
const chemistryTarget = path.join(packRoot, 'chemistry');
if (fs.existsSync(chemistrySource)) {
  fs.mkdirSync(chemistryTarget, { recursive: true });
  for (const entry of fs.readdirSync(chemistrySource, { withFileTypes: true })) {
    if (entry.isFile()) copy(path.join(chemistrySource, entry.name), path.join(chemistryTarget, entry.name));
  }
}

const files: Array<{path:string;checksum:string;size:number}> = [];
function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name !== 'manifest.json') {
      const rel = path.relative(packRoot, full).split(path.sep).join('/');
      files.push({ path: rel, checksum: sha256File(full), size: fs.statSync(full).size });
    }
  }
}
walk(packRoot);
files.sort((a,b) => a.path.localeCompare(b.path));

const checksum = sha256Buffer(files.map((x) => `${x.path}:${x.checksum}:${x.size}`).join('\n'));
const manifest = {
  contentVersion,
  curriculumVersion: meta.curriculumVersion,
  schemaVersion: meta.schemaVersion,
  chemistryRulesVersion: meta.chemistryRulesVersion,
  assessmentVersion: meta.assessmentVersion,
  scoringVersion: meta.scoringVersion,
  createdAt: meta.createdAt,
  checksum,
  compatibility: { minAppVersion: '20.1.0' },
  grades,
  files,
};
writeJson(path.join(packRoot, 'manifest.json'), manifest);
const currentPointer = readReleasePointer(root);
const nextPointer = createActivationPointer(currentPointer, { contentVersion, checksum });
writeReleasePointerAtomic(root, nextPointer);

console.log(JSON.stringify({ contentVersion, files: files.length, checksum, previousVersion: nextPointer.previousVersion ?? null }));
