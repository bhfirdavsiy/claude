import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File, sha256Buffer } from '../src/domain/content/checksum.ts';
import { createActivationPointer } from '../src/runtime/compatibility/release-pointer.ts';
import { CONFIG_SOURCE_NAMES, EXECUTION_PLAN_PACK_PATH, compileExecutionPlans } from '../src/runtime/practice-router/execution-plan.ts';
import { ASSESSMENT_KEY_PACK_PATH, ASSESSMENT_PROMPT_PACK_PATH, splitAssessmentBank } from '../src/domain/assessment/model.ts';
import { deriveItemLifecycle } from '../src/domain/assessment/governance.ts';
import { READINESS_PACK_PATH } from '../src/domain/readiness/readiness.ts';
import { compileReadiness } from './lib/readiness-compile.ts';
import { parseElementNameCatalog, parseInteractionCatalog, parseSpeciesNameCatalog } from '../src/features/localization/element-names.ts';
import { readReleasePointer, writeReleasePointerAtomic } from './release-pointer-io.ts';
import { structuredTheoryPack } from './lib/structured-theory.ts';
import { STRUCTURED_THEORY_PACK_PATH } from '../src/domain/theory/structured-theory.ts';

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

for (const name of ['concepts.json','theory-activities.json','practice-activities.json','mapping-links.json','external-lab-bindings.json','learning-cycle.json']) {
  copy(path.join(source, name), path.join(packRoot, name));
}
copy(path.join(source, 'aliases.yaml'), path.join(packRoot, 'aliases.yaml'));
// P2.3: structured theory — malformed authored entries fail the build; only complete, sourced entries ship
writeJson(path.join(packRoot, STRUCTURED_THEORY_PACK_PATH), structuredTheoryPack(root));

// P1.1 (C3): the authored bank (content-src/assessment-items.json) is never shipped as-is. The pack
// carries a learner-facing prompt layer and a separate answer-key layer that a deployment can withhold.
// P1.2: the shipped review state is DERIVED from the human review register — never taken from the bank.
const reviewRegister = JSON.parse(fs.readFileSync(path.join(source, 'assessment-reviews.json'), 'utf8'));
const unitById = new Map(units.map((u: any) => [u.id, u]));
const assessment = splitAssessmentBank(JSON.parse(fs.readFileSync(path.join(source, 'assessment-items.json'), 'utf8')), {
  effectiveReview: (item: any) => {
    const unit: any = unitById.get(item.learningUnitId);
    const verdict = deriveItemLifecycle(item, reviewRegister.records ?? [], { unitOutcomeCount: unit?.learningOutcomes?.length ?? 0, unitConceptIds: unit?.conceptIds ?? [] });
    if (verdict.lifecycle === 'APPROVED') return { chemistry: 'approved', didactic: 'approved' };
    const shipped = (d: string) => (d === 'rejected' ? 'rejected' : 'pending') as 'rejected' | 'pending';
    return { chemistry: shipped(verdict.review.chemistry), didactic: shipped(verdict.review.didactic) };
  },
});
writeJson(path.join(packRoot, ASSESSMENT_PROMPT_PACK_PATH), assessment.prompts);
writeJson(path.join(packRoot, ASSESSMENT_KEY_PACK_PATH), assessment.keys);


const activityConfigsSource = path.join(source, 'activity-configs');
const activityConfigsTarget = path.join(packRoot, 'activity-configs');
if (fs.existsSync(activityConfigsSource)) {
  fs.cpSync(activityConfigsSource, activityConfigsTarget, { recursive: true });
}

// P1.1 (D8): every activity is compiled to exactly one canonical ActivityExecutionPlan. The runtime only
// reads plans; a released activity without a route, or with conflicting routes, fails the build.
{
  const activities = JSON.parse(fs.readFileSync(path.join(source, 'practice-activities.json'), 'utf8'));
  const configs = Object.fromEntries(CONFIG_SOURCE_NAMES.map((name) => {
    const file = path.join(activityConfigsSource, `${name}.json`);
    return [name, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}];
  }));
  const compiled = compileExecutionPlans(activities, configs);
  if (compiled.fatal.length) {
    for (const e of compiled.fatal) console.error(`ROUTING_${e.code}:${e.activityId}:${e.detail}`);
    throw new Error(`EXECUTION_PLAN_COMPILE_FAILED: ${compiled.fatal.length} activity route error(s)`);
  }
  writeJson(path.join(packRoot, EXECUTION_PLAN_PACK_PATH), compiled.pack);

  // P1.2: the ONE runtime readiness authority (activity status/reasons/enforcement + unit assessment facts).
  const readiness = compileReadiness({
    activities, configs,
    mappings: JSON.parse(fs.readFileSync(path.join(source, 'mapping-links.json'), 'utf8')),
    units,
    bank: JSON.parse(fs.readFileSync(path.join(source, 'assessment-items.json'), 'utf8')),
    reviews: JSON.parse(fs.readFileSync(path.join(source, 'assessment-reviews.json'), 'utf8')).records ?? [],
    pilot: JSON.parse(fs.readFileSync(path.join(source, 'learning-pilot.json'), 'utf8')),
  });
  if (readiness.fatal.length) { for (const f of readiness.fatal) console.error(f); throw new Error(`READINESS_COMPILE_FAILED: ${readiness.fatal.length}`); }
  writeJson(path.join(packRoot, READINESS_PACK_PATH), readiness.pack);
}

const chemistrySource = path.join(source, 'chemistry');
const chemistryTarget = path.join(packRoot, 'chemistry');
if (fs.existsSync(chemistrySource)) {
  fs.mkdirSync(chemistryTarget, { recursive: true });
  for (const entry of fs.readdirSync(chemistrySource, { withFileTypes: true })) {
    if (entry.isFile()) copy(path.join(chemistrySource, entry.name), path.join(chemistryTarget, entry.name));
  }
}

// P1.4 closeout: localized display text (element names, …) ships as content. Every locale file is validated
// (keys must be real element symbols) before it is copied — an invalid file fails the build.
const localeSource = path.join(source, 'locales');
if (fs.existsSync(localeSource)) {
  for (const locale of fs.readdirSync(localeSource, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dir = path.join(localeSource, locale.name);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json'))) {
      const from = path.join(dir, entry.name);
      if (entry.name === 'chemistry-elements.json') {
        const catalog = parseElementNameCatalog(JSON.parse(fs.readFileSync(from, 'utf8')));
        if (catalog.locale.toLowerCase() !== locale.name) throw new Error(`ELEMENT_NAMES_INVALID:locale:${catalog.locale}`);
      }
      if (entry.name === 'learner-interaction.json') {
        const catalog = parseInteractionCatalog(JSON.parse(fs.readFileSync(from, 'utf8')));
        if (catalog.locale.toLowerCase() !== locale.name) throw new Error(`INTERACTION_TEXT_INVALID:locale:${catalog.locale}`);
      }
      if (entry.name === 'chemistry-species.json') {
        const catalog = parseSpeciesNameCatalog(JSON.parse(fs.readFileSync(from, 'utf8')));
        if (catalog.locale.toLowerCase() !== locale.name) throw new Error(`SPECIES_NAMES_INVALID:locale:${catalog.locale}`);
      }
      fs.mkdirSync(path.join(packRoot, 'locales', locale.name), { recursive: true });
      copy(from, path.join(packRoot, 'locales', locale.name, entry.name));
    }
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
  // Optional declaration of how evidence recorded under older versions may be reused (P0.5).
  ...(fs.existsSync(path.join(source, 'evidence-compatibility.json')) ? { evidenceCompatibility: JSON.parse(fs.readFileSync(path.join(source, 'evidence-compatibility.json'), 'utf8')) } : {}),
  grades,
  files,
};
writeJson(path.join(packRoot, 'manifest.json'), manifest);
const currentPointer = readReleasePointer(root);
const nextPointer = createActivationPointer(currentPointer, { contentVersion, checksum });
writeReleasePointerAtomic(root, nextPointer);

console.log(JSON.stringify({ contentVersion, files: files.length, checksum, previousVersion: nextPointer.previousVersion ?? null }));
