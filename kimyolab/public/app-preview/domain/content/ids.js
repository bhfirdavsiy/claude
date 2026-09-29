                                               

function cleanLegacyId(legacyId        )         {
  const value = String(legacyId ?? '').trim();
  if (!/^[0-9]+(?:\.[0-9]+)+$/.test(value)) {
    throw new Error(`INVALID_LEGACY_ID:${value}`);
  }
  return value;
}

export function canonicalLearningUnitId(legacyId        )         {
  return `lu.${cleanLegacyId(legacyId)}`;
}

export function canonicalTheoryId(legacyId        )         {
  return `theory.${cleanLegacyId(legacyId)}`;
}

export function canonicalPracticeId(type              , legacyOrTheoryId        , planned = false)         {
  const suffix = planned ? '.planned' : '';
  return `practice.${type}.${cleanLegacyId(legacyOrTheoryId)}${suffix}`;
}

export function canonicalConceptId(index        )         {
  if (!Number.isInteger(index) || index < 1) throw new Error('INVALID_CONCEPT_INDEX');
  return `concept.c${String(index).padStart(3, '0')}`;
}

export function canonicalMappingId(legacyTheoryId        , role                        , index = 0)         {
  const base = `mapping.${cleanLegacyId(legacyTheoryId)}.${role}`;
  return role === 'supporting' ? `${base}.${String(index).padStart(2, '0')}` : base;
}
