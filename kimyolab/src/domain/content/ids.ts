import type { PracticeType } from './types.ts';

function cleanLegacyId(legacyId: string): string {
  const value = String(legacyId ?? '').trim();
  if (!/^[0-9]+(?:\.[0-9]+)+$/.test(value)) {
    throw new Error(`INVALID_LEGACY_ID:${value}`);
  }
  return value;
}

export function canonicalLearningUnitId(legacyId: string): string {
  return `lu.${cleanLegacyId(legacyId)}`;
}

export function canonicalTheoryId(legacyId: string): string {
  return `theory.${cleanLegacyId(legacyId)}`;
}

export function canonicalPracticeId(type: PracticeType, legacyOrTheoryId: string, planned = false): string {
  const suffix = planned ? '.planned' : '';
  return `practice.${type}.${cleanLegacyId(legacyOrTheoryId)}${suffix}`;
}

export function canonicalConceptId(index: number): string {
  if (!Number.isInteger(index) || index < 1) throw new Error('INVALID_CONCEPT_INDEX');
  return `concept.c${String(index).padStart(3, '0')}`;
}

export function canonicalMappingId(legacyTheoryId: string, role: 'primary'|'supporting', index = 0): string {
  const base = `mapping.${cleanLegacyId(legacyTheoryId)}.${role}`;
  return role === 'supporting' ? `${base}.${String(index).padStart(2, '0')}` : base;
}
