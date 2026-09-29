import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalConceptId,
  canonicalLearningUnitId,
  canonicalMappingId,
  canonicalPracticeId,
  canonicalTheoryId,
} from '../src/domain/content/ids.ts';
import type {
  ApprovalRecord,
  ApprovalState,
  CoverageStatus,
  PracticeType,
} from '../src/domain/content/types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'content-src');

const curriculum = JSON.parse(fs.readFileSync(path.join(root, 'data/curriculum.json'), 'utf8'));
const legacyPractices = JSON.parse(fs.readFileSync(path.join(root, 'data/practices.json'), 'utf8'));

const CONTENT_VERSION = '2026.09.1';
const CURRICULUM_VERSION = '2026.09';
const SCHEMA_VERSION = '1.0.0';
const CHEMISTRY_RULES_VERSION = '1.0.0-rc.1';
const CONTENT_CREATED_AT = '2026-09-22T00:00:00.000Z';

function gradeNumber(value: unknown): 7|8|9|10|11 {
  const m = String(value ?? '').match(/(7|8|9|10|11)/);
  if (!m) throw new Error(`INVALID_GRADE:${value}`);
  return Number(m[1]) as 7|8|9|10|11;
}

function mapPracticeType(value: unknown): PracticeType {
  const v = String(value ?? '').trim().toLocaleLowerCase('uz');
  if (v === 'lab' || v.includes('laborator')) return 'experiment';
  if (v.includes('simuly')) return 'simulation';
  if (v.includes('trenaj')) return 'trainer';
  if (v.includes('hisob')) return 'calculation';
  if (v === 'case' || v.includes('keys')) return 'case';
  throw new Error(`UNKNOWN_PRACTICE_TYPE:${value}`);
}

function coverageStatus(value: unknown): CoverageStatus {
  const v = String(value ?? '').trim();
  if (v === 'Mavjud') return 'full';
  if (v === 'Qisman mavjud') return 'partial';
  if (v === 'Yangi kerak') return 'none';
  return 'none';
}

function sourceRef(id: string, title: unknown) {
  return [{
    id: `src.legacy.${id}`,
    type: 'internal',
    title: String(title || 'Legacy KimyoLab migration source'),
  }];
}

function pending(role: string, version = CONTENT_VERSION): ApprovalRecord {
  return {
    status: 'pending',
    reviewerId: 'unassigned',
    reviewerRole: role,
    reviewedVersion: version,
    reviewedHash: '',
    reviewedAt: '',
  };
}

function pendingApprovals(chemistryApplicable = true): ApprovalState {
  return {
    technical: pending('technical'),
    chemistry: chemistryApplicable ? pending('chemistry') : 'not_applicable',
    didactic: pending('didactic'),
    accessibility: pending('accessibility'),
  };
}

function normalizeConceptLabel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[’‘`ʻʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

fs.mkdirSync(outDir, { recursive: true });

// Conservative migration: case is preserved. Semantic dedupe is deliberately not automatic.
const conceptIdByLabel = new Map<string,string>();
const conceptGrades = new Map<string,Set<number>>();
for (const row of curriculum) {
  for (const raw of row.concepts ?? []) {
    const label = normalizeConceptLabel(raw);
    if (!label) continue;
    if (!conceptIdByLabel.has(label)) conceptIdByLabel.set(label, canonicalConceptId(conceptIdByLabel.size + 1));
    const id = conceptIdByLabel.get(label)!;
    if (!conceptGrades.has(id)) conceptGrades.set(id, new Set());
    conceptGrades.get(id)!.add(gradeNumber(row.grade));
  }
}

const concepts = [...conceptIdByLabel.entries()].map(([name, id]) => ({
  id,
  name,
  gradeRange: [...conceptGrades.get(id)!].sort((a,b) => a-b),
  prerequisiteIds: [],
  relatedConceptIds: [],
  representations: [],
  misconceptionIds: [],
  synonyms: { 'uz-Latn': [name] },
  sourceRefs: [{ id: 'src.legacy.curriculum', type: 'internal', title: 'Legacy curriculum mapping migration' }],
}));

const learningUnits = curriculum.map((row: any) => ({
  id: canonicalLearningUnitId(row.id),
  grade: gradeNumber(row.grade),
  title: row.title,
  chapter: row.source || undefined,
  learningOutcomes: row.mappingLogic ? [row.mappingLogic] : [],
  conceptIds: (row.concepts ?? []).map((x: unknown) => conceptIdByLabel.get(normalizeConceptLabel(x))).filter(Boolean),
  prerequisiteConceptIds: [],
  lessonTemplates: [],
  curriculumVersion: CURRICULUM_VERSION,
  sourceRefs: sourceRef(row.id, row.source),
  legacyIds: [row.id],
}));

const theoryActivities = curriculum.map((row: any) => ({
  id: canonicalTheoryId(row.id),
  title: row.title,
  conceptIds: (row.concepts ?? []).map((x: unknown) => conceptIdByLabel.get(normalizeConceptLabel(x))).filter(Boolean),
  explanationBlocks: [
    ...(row.conceptsText ? [{ type: 'concept-summary', text: row.conceptsText }] : []),
    ...(row.mappingLogic ? [{ type: 'legacy-mapping-note', text: row.mappingLogic }] : []),
  ],
  representationModes: [],
  interactionType: row.visualFormat ? 'legacy-interaction-description' : undefined,
  interactionConfig: row.visualFormat || row.interaction ? { visualFormat: row.visualFormat, interaction: row.interaction } : undefined,
  misconceptionCheckIds: [],
  lifecycleStatus: 'draft',
  approvals: pendingApprovals(false),
  version: CONTENT_VERSION,
  legacyIds: [row.id],
}));

const realLegacyPractices = legacyPractices.filter((row: any) => row.id !== '11.1');
const practiceByLegacyId = new Map<string,any>();
const practiceActivities: any[] = [];

for (const row of realLegacyPractices) {
  const type = mapPracticeType(row.mappingType || row.catalogType || 'Lab');
  const activity = {
    id: canonicalPracticeId(type, row.id),
    type,
    title: row.title,
    goal: row.goal || row.mappingGoal || row.title,
    conceptIds: [],
    prerequisiteConceptIds: [],
    lifecycleStatus: 'planned',
    approvals: pendingApprovals(type === 'experiment'),
    accessibilityProfile: [],
    engineCompatibility: { engine: type, range: '^1.0.0' },
    sourceRefs: sourceRef(row.id, row.source),
    legacyIds: [row.id],
    version: CONTENT_VERSION,
    legacyContent: {
      equipment: row.equipment || '',
      materials: row.materials || '',
      safety: row.safety || '',
      steps: row.steps || [],
      tasks: row.tasks || [],
      reagents: row.reagents || [],
      recommended: row.recommended || [],
      mappingStatus: row.mappingStatus || '',
      mappingNote: row.mappingNote || '',
    },
  };
  practiceByLegacyId.set(row.id, activity);
  practiceActivities.push(activity);
}

const mappings: any[] = [];
for (const row of curriculum) {
  const desiredType = mapPracticeType(row.practiceType);
  const existingIds: string[] = (row.existingPracticeIds ?? []).filter((id: string) => id !== '11.1');
  const existingActivities = existingIds.map((id) => practiceByLegacyId.get(id)).filter(Boolean);
  let primary = existingActivities.find((p) => p.type === desiredType);

  if (!primary) {
    const plannedId = canonicalPracticeId(desiredType, row.id, true);
    primary = practiceActivities.find((p) => p.id === plannedId);
    if (!primary) {
      primary = {
        id: plannedId,
        type: desiredType,
        title: row.newOrImproved || `${row.title} — ${desiredType}`,
        goal: row.newOrImproved || row.mappingLogic || row.title,
        conceptIds: (row.concepts ?? []).map((x: unknown) => conceptIdByLabel.get(normalizeConceptLabel(x))).filter(Boolean),
        prerequisiteConceptIds: [],
        lifecycleStatus: 'planned',
        approvals: pendingApprovals(desiredType === 'experiment'),
        accessibilityProfile: [],
        engineCompatibility: { engine: desiredType, range: '^1.0.0' },
        sourceRefs: sourceRef(row.id, row.source),
        legacyIds: [],
        version: CONTENT_VERSION,
        legacyContent: { migrationReason: 'required primary activity not represented by matching legacy practice', legacyRecommendation: row.newOrImproved || '' },
      };
      practiceActivities.push(primary);
    }
  }

  const conceptIds = (row.concepts ?? []).map((x: unknown) => conceptIdByLabel.get(normalizeConceptLabel(x))).filter(Boolean);
  mappings.push({
    id: canonicalMappingId(row.id, 'primary'),
    learningUnitId: canonicalLearningUnitId(row.id),
    theoryActivityId: canonicalTheoryId(row.id),
    practiceActivityId: primary.id,
    conceptIds,
    role: 'primary',
    required: true,
    coverageStatus: coverageStatus(row.coverage),
  });

  let supportingIndex = 1;
  for (const activity of existingActivities) {
    if (activity.id === primary.id) continue;
    mappings.push({
      id: canonicalMappingId(row.id, 'supporting', supportingIndex++),
      learningUnitId: canonicalLearningUnitId(row.id),
      theoryActivityId: canonicalTheoryId(row.id),
      practiceActivityId: activity.id,
      conceptIds,
      role: 'supporting',
      required: false,
      coverageStatus: coverageStatus(row.coverage),
    });
  }
}


// Hand-authored practice additions allow a curriculum mapping to be corrected without
// mutating the legacy source database. Additions are explicit, versioned authoring data.
const additionsFile = path.join(outDir, 'practice-additions.json');
if (fs.existsSync(additionsFile)) {
  const additions = JSON.parse(fs.readFileSync(additionsFile, 'utf8'));
  for (const addition of additions) {
    if (!addition.id || !addition.learningUnitLegacyId || !addition.type || !addition.title || !addition.goal) {
      throw new Error('PRACTICE_ADDITION_INVALID');
    }
    if (practiceActivities.some((p) => p.id === addition.id)) throw new Error(`PRACTICE_ADDITION_DUPLICATE:${addition.id}`);
    const unit = learningUnits.find((u: any) => u.legacyIds.includes(addition.learningUnitLegacyId));
    if (!unit) throw new Error(`PRACTICE_ADDITION_UNIT_UNKNOWN:${addition.learningUnitLegacyId}`);
    const type = addition.type as PracticeType;
    if (!['experiment','simulation','trainer','calculation','case'].includes(type)) throw new Error(`PRACTICE_ADDITION_TYPE_INVALID:${addition.id}`);
    practiceActivities.push({
      id: addition.id,
      type,
      title: addition.title,
      goal: addition.goal,
      conceptIds: [...unit.conceptIds],
      prerequisiteConceptIds: [],
      lifecycleStatus: addition.lifecycleStatus || 'planned',
      approvals: pendingApprovals(type === 'experiment'),
      accessibilityProfile: Array.isArray(addition.accessibilityProfile) ? [...addition.accessibilityProfile] : [],
      engineCompatibility: { engine: type, range: addition.engineRange || '^1.0.0' },
      sourceRefs: sourceRef(addition.learningUnitLegacyId, addition.sourceTitle || unit.chapter || unit.title),
      legacyIds: [],
      version: CONTENT_VERSION,
      legacyContent: { authoringReason: addition.authoringReason || 'explicit Beta2 practice addition' },
    });
  }
}


// Hand-authored implementation overrides are applied only after all legacy and planned
// activities have been materialized. This keeps migration deterministic and prevents
// planned primary activities (for example 7.07) from being patched before they exist.
const overridesFile = path.join(outDir, 'activity-overrides.json');
if (fs.existsSync(overridesFile)) {
  const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
  for (const override of overrides) {
    const activity = practiceActivities.find((p) => p.id === override.activityId);
    if (!activity) throw new Error(`ACTIVITY_OVERRIDE_TARGET_MISSING:${override.activityId}`);
    if (override.lifecycleStatus) activity.lifecycleStatus = override.lifecycleStatus;
    if (Array.isArray(override.conceptIds)) activity.conceptIds = [...override.conceptIds];
    if (Array.isArray(override.accessibilityProfile)) activity.accessibilityProfile = [...override.accessibilityProfile];
  }
}

// Human reviewer decisions are source-controlled separately from generated activities.
// This prevents a later migration from silently erasing valid approvals. Effective
// approval validation still happens at runtime against the current activity hash/version.
const approvalOverridesFile = path.join(outDir, 'activity-approval-overrides.json');
if (fs.existsSync(approvalOverridesFile)) {
  const approvalOverrides = JSON.parse(fs.readFileSync(approvalOverridesFile, 'utf8'));
  if (!Array.isArray(approvalOverrides)) throw new Error('ACTIVITY_APPROVAL_OVERRIDES_INVALID');
  for (const override of approvalOverrides) {
    const activity = practiceActivities.find((p) => p.id === override.activityId);
    if (!activity) throw new Error(`ACTIVITY_APPROVAL_TARGET_MISSING:${override.activityId}`);
    const kind = String(override.approvalType || '');
    if (!['technical','didactic','accessibility','chemistry'].includes(kind)) throw new Error(`ACTIVITY_APPROVAL_TYPE_INVALID:${override.activityId}:${kind}`);
    if (kind === 'chemistry' && activity.approvals.chemistry === 'not_applicable') throw new Error(`ACTIVITY_APPROVAL_NOT_APPLICABLE:${override.activityId}:chemistry`);
    const record = override.record;
    if (!record || !['pending','approved','rejected'].includes(record.status)) throw new Error(`ACTIVITY_APPROVAL_RECORD_INVALID:${override.activityId}:${kind}`);
    activity.approvals[kind] = record;
  }
}

// Mapping coverage is authoring metadata. Apply explicit overrides after every
// primary/supporting relation has been generated so migration remains deterministic.
const mappingOverridesFile = path.join(outDir, 'mapping-overrides.json');
if (fs.existsSync(mappingOverridesFile)) {
  const mappingOverrides = JSON.parse(fs.readFileSync(mappingOverridesFile, 'utf8'));
  for (const override of mappingOverrides) {
    const mapping = mappings.find((m) => m.id === override.mappingId);
    if (!mapping) throw new Error(`MAPPING_OVERRIDE_TARGET_MISSING:${override.mappingId}`);
    if (override.practiceActivityId && override.practiceActivityId !== mapping.practiceActivityId) {
      const replacement = practiceActivities.find((p) => p.id === override.practiceActivityId);
      if (!replacement) throw new Error(`MAPPING_OVERRIDE_PRACTICE_MISSING:${override.practiceActivityId}`);
      const previousPracticeId = mapping.practiceActivityId;
      mapping.practiceActivityId = override.practiceActivityId;
      if (override.preservePreviousAsSupporting) {
        const already = mappings.some((m) => m.learningUnitId === mapping.learningUnitId && m.role === 'supporting' && m.practiceActivityId === previousPracticeId);
        if (!already) {
          const unit = learningUnits.find((u: any) => u.id === mapping.learningUnitId);
          if (!unit) throw new Error(`MAPPING_OVERRIDE_UNIT_MISSING:${mapping.learningUnitId}`);
          const legacyId = unit.legacyIds[0];
          const nextIndex = mappings.filter((m) => m.learningUnitId === mapping.learningUnitId && m.role === 'supporting').length + 1;
          mappings.push({
            id: canonicalMappingId(legacyId, 'supporting', nextIndex),
            learningUnitId: mapping.learningUnitId,
            theoryActivityId: mapping.theoryActivityId,
            practiceActivityId: previousPracticeId,
            conceptIds: [...mapping.conceptIds],
            role: 'supporting',
            required: false,
            coverageStatus: override.previousCoverageStatus || 'partial',
          });
        }
      }
    }
    if (override.coverageStatus) mapping.coverageStatus = override.coverageStatus;
  }
}

const aliases = [
  ...curriculum.flatMap((row: any) => [
    { from: `learning-unit:${row.id}`, to: canonicalLearningUnitId(row.id), reason: 'legacy-migration', effectiveFrom: CONTENT_VERSION },
    { from: `theory:${row.id}`, to: canonicalTheoryId(row.id), reason: 'legacy-migration', effectiveFrom: CONTENT_VERSION },
  ]),
  ...realLegacyPractices.map((row: any) => ({
    from: `practice:${row.id}`,
    to: practiceByLegacyId.get(row.id).id,
    reason: 'legacy-migration',
    effectiveFrom: CONTENT_VERSION,
  })),
  { from: '11.1', to: 'reclassified.11.summary-reflection', reason: 'legacy-migration', effectiveFrom: CONTENT_VERSION },
];

writeJson('concepts.json', concepts);
writeJson('learning-units.json', learningUnits);
writeJson('theory-activities.json', theoryActivities);
writeJson('practice-activities.json', practiceActivities);
writeJson('mapping-links.json', mappings);
// Canonical source must be reproducible: keep the previous timestamp when the report content is unchanged.
const migrationReportBody = {
  legacyTheoryCount: curriculum.length,
  legacyPracticeRows: legacyPractices.length,
  excludedLegacyPracticeIds: ['11.1'],
  canonicalConceptCount: concepts.length,
  canonicalPracticeCount: practiceActivities.length,
  primaryMappingCount: mappings.filter((x) => x.role === 'primary').length,
  supportingMappingCount: mappings.filter((x) => x.role === 'supporting').length,
};
const previousMigrationReport = (() => { try { return JSON.parse(fs.readFileSync(path.join(outDir, 'migration-report.json'), 'utf8')); } catch { return undefined; } })();
const { generatedAt: previousGeneratedAt, ...previousBody } = previousMigrationReport ?? {};
writeJson('migration-report.json', {
  generatedAt: previousGeneratedAt && JSON.stringify(previousBody) === JSON.stringify(migrationReportBody) ? previousGeneratedAt : new Date().toISOString(),
  ...migrationReportBody,
});

const manifestYaml = `contentVersion: "${CONTENT_VERSION}"\ncurriculumVersion: "${CURRICULUM_VERSION}"\nschemaVersion: "${SCHEMA_VERSION}"\nchemistryRulesVersion: "${CHEMISTRY_RULES_VERSION}"\nassessmentVersion: "0.0.0"\nscoringVersion: "0.0.0"\nauthoringSource: "content-src"\nruntimeSource: "public/content/${CONTENT_VERSION}"\ncreatedAt: "${CONTENT_CREATED_AT}"\n`;
fs.writeFileSync(path.join(outDir, 'manifest.yaml'), manifestYaml, 'utf8');

const quote = (v: unknown) => JSON.stringify(String(v));
const aliasesYaml = aliases.map((a) => `- from: ${quote(a.from)}\n  to: ${quote(a.to)}\n  reason: ${quote(a.reason)}\n  effectiveFrom: ${quote(a.effectiveFrom)}`).join('\n');
fs.writeFileSync(path.join(outDir, 'aliases.yaml'), `${aliasesYaml}\n`, 'utf8');

console.log(JSON.stringify({
  learningUnits: learningUnits.length,
  theoryActivities: theoryActivities.length,
  concepts: concepts.length,
  practiceActivities: practiceActivities.length,
  mappings: mappings.length,
  primaryMappings: mappings.filter((x) => x.role === 'primary').length,
}, null, 2));
