import type { LearningUnit, MappingLink, PracticeActivity } from '../../domain/content/types.ts';
import {effectiveApprovalState} from '../governance/approvals.ts';

export interface Beta1ReadinessInput {
  units: LearningUnit[];
  practices: PracticeActivity[];
  mappings: MappingLink[];
  configRegistry: Record<string, unknown>;
}

export interface Beta1ReadinessRow {
  learningUnitId: string;
  legacyId?: string;
  practiceActivityId?: string;
  technicalReady: boolean;
  releaseReady: boolean;
  reasons: string[];
  approvalPending: string[];
}

export interface Beta1ReadinessReport {
  totalLearningUnits: number;
  technicalReady: number;
  releaseReady: number;
  rows: Beta1ReadinessRow[];
}

function approvalPending(practice: PracticeActivity): string[] {
  const approvals=effectiveApprovalState(practice as any);
  const pending: string[] = [];
  if (approvals.technical.status !== 'approved') pending.push('technical');
  if (approvals.didactic.status !== 'approved') pending.push('didactic');
  if (approvals.accessibility.status !== 'approved') pending.push('accessibility');
  if (approvals.chemistry !== 'not_applicable' && approvals.chemistry.status !== 'approved') pending.push('chemistry');
  return pending;
}

export function buildBeta1ReadinessReport(input: Beta1ReadinessInput): Beta1ReadinessReport {
  const units = input.units.filter((unit) => unit.grade === 7 || unit.grade === 8);
  const practices = new Map(input.practices.map((practice) => [practice.id, practice]));
  const primary = new Map<string, MappingLink>();
  for (const mapping of input.mappings) {
    if (mapping.role !== 'primary' || !units.some((unit) => unit.id === mapping.learningUnitId)) continue;
    if (primary.has(mapping.learningUnitId)) throw new Error(`BETA1_PRIMARY_MAPPING_DUPLICATE:${mapping.learningUnitId}`);
    primary.set(mapping.learningUnitId, mapping);
  }

  const rows: Beta1ReadinessRow[] = units.map((unit) => {
    const mapping = primary.get(unit.id);
    const reasons: string[] = [];
    if (!mapping) {
      reasons.push('PRIMARY_MAPPING_MISSING');
      return {
        learningUnitId: unit.id,
        legacyId: unit.legacyIds?.[0],
        technicalReady: false,
        releaseReady: false,
        reasons,
        approvalPending: [],
      };
    }

    const practice = practices.get(mapping.practiceActivityId);
    if (!practice) reasons.push('PRACTICE_MISSING');
    if (mapping.coverageStatus !== 'full') reasons.push('MAPPING_NOT_FULL');
    if (practice && practice.lifecycleStatus !== 'ready') reasons.push('ACTIVITY_NOT_READY');
    if (!Object.prototype.hasOwnProperty.call(input.configRegistry, mapping.practiceActivityId)) reasons.push('CONFIG_MISSING');
    if (practice && practice.accessibilityProfile.length === 0) reasons.push('ACCESSIBILITY_PROFILE_MISSING');
    if (practice && practice.engineCompatibility.engine !== practice.type) reasons.push('ENGINE_COMPATIBILITY_MISMATCH');

    const technicalReady = reasons.length === 0;
    const pending = practice ? approvalPending(practice) : [];
    const releaseReady = technicalReady && pending.length === 0;
    return {
      learningUnitId: unit.id,
      legacyId: unit.legacyIds?.[0],
      practiceActivityId: mapping.practiceActivityId,
      technicalReady,
      releaseReady,
      reasons,
      approvalPending: pending,
    };
  });

  return {
    totalLearningUnits: rows.length,
    technicalReady: rows.filter((row) => row.technicalReady).length,
    releaseReady: rows.filter((row) => row.releaseReady).length,
    rows,
  };
}
