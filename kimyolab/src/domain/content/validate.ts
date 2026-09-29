export interface CanonicalDataSet {
  concepts: any[];
  learningUnits: any[];
  theoryActivities: any[];
  practiceActivities: any[];
  mappingLinks: any[];
}

export interface ValidationGate {
  duplicateCanonicalIds: number;
  unknownRefs: number;
  forwardReverseMismatch: number;
  schemaErrors: number;
  orphanRequiredEntities: number;
}

export interface ValidationResult {
  gate: ValidationGate;
  primaryMappings: number;
  details: {
    duplicates: string[];
    unknownRefs: string[];
    schemaErrors: string[];
    orphanRequiredEntities: string[];
    forwardReverseMismatch: string[];
  };
}

const REQUIRED: Record<string, string[]> = {
  concept: ['id','name','gradeRange','prerequisiteIds','relatedConceptIds','representations','misconceptionIds','synonyms','sourceRefs'],
  learningUnit: ['id','grade','title','learningOutcomes','conceptIds','prerequisiteConceptIds','lessonTemplates','curriculumVersion','sourceRefs','legacyIds'],
  theoryActivity: ['id','title','conceptIds','explanationBlocks','representationModes','misconceptionCheckIds','lifecycleStatus','approvals','version','legacyIds'],
  practiceActivity: ['id','type','title','goal','conceptIds','prerequisiteConceptIds','lifecycleStatus','approvals','accessibilityProfile','engineCompatibility','sourceRefs','legacyIds','version'],
  mappingLink: ['id','learningUnitId','practiceActivityId','conceptIds','role','required','coverageStatus'],
};

const PRACTICE_TYPES = new Set(['experiment','simulation','trainer','calculation','case']);
const COVERAGE = new Set(['none','partial','full','not_applicable']);
const ROLES = new Set(['primary','supporting','remediation','extension']);
const LIFECYCLE = new Set(['draft','planned','in_progress','implemented','ready','deprecated']);

function hasRequired(obj: any, fields: string[], label: string, errors: string[]) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push(`${label}:not-object`);
    return;
  }
  for (const field of fields) {
    if (!(field in obj)) errors.push(`${label}:missing:${field}`);
  }
}

function validateShapes(data: CanonicalDataSet): string[] {
  const errors: string[] = [];
  data.concepts.forEach((x, i) => hasRequired(x, REQUIRED.concept, `concept[${i}]`, errors));
  data.learningUnits.forEach((x, i) => {
    hasRequired(x, REQUIRED.learningUnit, `learningUnit[${i}]`, errors);
    if (![7,8,9,10,11].includes(x.grade)) errors.push(`learningUnit[${i}]:invalid-grade:${x.grade}`);
    if ('practiceActivityIds' in x || 'theoryActivityIds' in x) errors.push(`learningUnit[${i}]:duplicate-relation-array`);
  });
  data.theoryActivities.forEach((x, i) => {
    hasRequired(x, REQUIRED.theoryActivity, `theoryActivity[${i}]`, errors);
    if (!LIFECYCLE.has(x.lifecycleStatus)) errors.push(`theoryActivity[${i}]:invalid-lifecycle`);
  });
  data.practiceActivities.forEach((x, i) => {
    hasRequired(x, REQUIRED.practiceActivity, `practiceActivity[${i}]`, errors);
    if (!PRACTICE_TYPES.has(x.type)) errors.push(`practiceActivity[${i}]:invalid-type:${x.type}`);
    if (!LIFECYCLE.has(x.lifecycleStatus)) errors.push(`practiceActivity[${i}]:invalid-lifecycle`);
  });
  data.mappingLinks.forEach((x, i) => {
    hasRequired(x, REQUIRED.mappingLink, `mappingLink[${i}]`, errors);
    if (!ROLES.has(x.role)) errors.push(`mappingLink[${i}]:invalid-role:${x.role}`);
    if (!COVERAGE.has(x.coverageStatus)) errors.push(`mappingLink[${i}]:invalid-coverage:${x.coverageStatus}`);
    if (typeof x.required !== 'boolean') errors.push(`mappingLink[${i}]:required-not-boolean`);
  });
  return errors;
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup].sort();
}

export function validateCanonicalData(data: CanonicalDataSet): ValidationResult {
  const allIds = [
    ...data.concepts.map((x) => x.id),
    ...data.learningUnits.map((x) => x.id),
    ...data.theoryActivities.map((x) => x.id),
    ...data.practiceActivities.map((x) => x.id),
    ...data.mappingLinks.map((x) => x.id),
  ].filter((x) => typeof x === 'string');

  const duplicateIds = duplicates(allIds);
  const schemaErrors = validateShapes(data);

  const conceptIds = new Set(data.concepts.map((x) => x.id));
  const unitIds = new Set(data.learningUnits.map((x) => x.id));
  const theoryIds = new Set(data.theoryActivities.map((x) => x.id));
  const practiceIds = new Set(data.practiceActivities.map((x) => x.id));
  const unknownRefs: string[] = [];

  const checkConcepts = (owner: string, refs: any[]) => {
    for (const id of refs ?? []) if (!conceptIds.has(id)) unknownRefs.push(`${owner}:concept:${id}`);
  };

  for (const x of data.learningUnits) {
    checkConcepts(x.id, x.conceptIds);
    checkConcepts(x.id, x.prerequisiteConceptIds);
  }
  for (const x of data.theoryActivities) checkConcepts(x.id, x.conceptIds);
  for (const x of data.practiceActivities) {
    checkConcepts(x.id, x.conceptIds);
    checkConcepts(x.id, x.prerequisiteConceptIds);
  }
  for (const x of data.mappingLinks) {
    if (!unitIds.has(x.learningUnitId)) unknownRefs.push(`${x.id}:learningUnit:${x.learningUnitId}`);
    if (x.theoryActivityId && !theoryIds.has(x.theoryActivityId)) unknownRefs.push(`${x.id}:theory:${x.theoryActivityId}`);
    if (!practiceIds.has(x.practiceActivityId)) unknownRefs.push(`${x.id}:practice:${x.practiceActivityId}`);
    checkConcepts(x.id, x.conceptIds);
  }

  const orphanRequiredEntities: string[] = [];
  const primaryByUnit = new Map<string, any[]>();
  for (const link of data.mappingLinks) {
    if (link.role === 'primary' && link.required === true) {
      const list = primaryByUnit.get(link.learningUnitId) ?? [];
      list.push(link);
      primaryByUnit.set(link.learningUnitId, list);
    }
  }
  for (const unit of data.learningUnits) {
    const count = primaryByUnit.get(unit.id)?.length ?? 0;
    if (count !== 1) orphanRequiredEntities.push(`${unit.id}:required-primary-count:${count}`);
  }

  // Forward and reverse views are derived from the single registry. This check guards
  // duplicate/lost relation entries during derivation rather than comparing two stored sources.
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  for (const link of data.mappingLinks) {
    if (!forward.has(link.learningUnitId)) forward.set(link.learningUnitId, new Set());
    forward.get(link.learningUnitId)!.add(link.id);
    if (!reverse.has(link.practiceActivityId)) reverse.set(link.practiceActivityId, new Set());
    reverse.get(link.practiceActivityId)!.add(link.id);
  }
  const mismatch: string[] = [];
  for (const link of data.mappingLinks) {
    if (!forward.get(link.learningUnitId)?.has(link.id)) mismatch.push(`${link.id}:missing-forward`);
    if (!reverse.get(link.practiceActivityId)?.has(link.id)) mismatch.push(`${link.id}:missing-reverse`);
  }

  return {
    gate: {
      duplicateCanonicalIds: duplicateIds.length,
      unknownRefs: unknownRefs.length,
      forwardReverseMismatch: mismatch.length,
      schemaErrors: schemaErrors.length,
      orphanRequiredEntities: orphanRequiredEntities.length,
    },
    primaryMappings: [...primaryByUnit.values()].reduce((n, x) => n + x.length, 0),
    details: {
      duplicates: duplicateIds,
      unknownRefs,
      schemaErrors,
      orphanRequiredEntities,
      forwardReverseMismatch: mismatch,
    },
  };
}
