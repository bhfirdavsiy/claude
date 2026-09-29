import type { LearningUnit, MappingLink, PracticeActivity } from '../../domain/content/types.ts';
import type { Beta2CapabilityRow, Beta2Disposition } from './capability.ts';
import {effectiveApprovalState} from '../governance/approvals.ts';

export interface Beta2ReadinessInput {
  units: LearningUnit[];
  practices: PracticeActivity[];
  mappings: MappingLink[];
  matrix: Beta2CapabilityRow[];
  configRegistry: Record<string, unknown>;
}

export interface Beta2ReadinessRow {
  learningUnitId:string;
  legacyId:string;
  disposition:Beta2Disposition;
  practiceActivityId:string;
  technicalReady:boolean;
  releaseReady:boolean;
  reasons:string[];
  approvalPending:string[];
}

export interface Beta2ReadinessReport {
  totalLearningUnits:number;
  technicalReady:number;
  releaseReady:number;
  blockedByDisposition:Record<Exclude<Beta2Disposition,'existing-engine'>,number>;
  rows:Beta2ReadinessRow[];
}

function pendingApprovals(practice:PracticeActivity):string[]{
  const approvals=effectiveApprovalState(practice as any);
  const out:string[]=[];
  if(approvals.technical.status!=='approved') out.push('technical');
  if(approvals.didactic.status!=='approved') out.push('didactic');
  if(approvals.accessibility.status!=='approved') out.push('accessibility');
  if(approvals.chemistry!=='not_applicable'&&approvals.chemistry.status!=='approved') out.push('chemistry');
  return out;
}

function dispositionReason(d:Beta2Disposition):string|undefined{
  if(d==='needs-capability') return 'CAPABILITY_PENDING';
  if(d==='needs-content') return 'CONTENT_GAP';
  if(d==='remap-required') return 'REMAP_REQUIRED';
}

export function buildBeta2ReadinessReport(input:Beta2ReadinessInput):Beta2ReadinessReport{
  const unitMap=new Map(input.units.filter(u=>u.grade===9||u.grade===10).map(u=>[u.id,u]));
  const practiceMap=new Map(input.practices.map(p=>[p.id,p]));
  const primary=new Map<string,MappingLink>();
  for(const mapping of input.mappings){
    if(mapping.role!=='primary'||!unitMap.has(mapping.learningUnitId)) continue;
    if(primary.has(mapping.learningUnitId)) throw new Error(`BETA2_PRIMARY_MAPPING_DUPLICATE:${mapping.learningUnitId}`);
    primary.set(mapping.learningUnitId,mapping);
  }
  if(input.matrix.length!==unitMap.size) throw new Error(`BETA2_MATRIX_COVERAGE_MISMATCH:${input.matrix.length}:${unitMap.size}`);

  const rows=input.matrix.map((cap):Beta2ReadinessRow=>{
    const unit=unitMap.get(cap.learningUnitId);
    if(!unit) throw new Error(`BETA2_MATRIX_UNIT_UNKNOWN:${cap.learningUnitId}`);
    const mapping=primary.get(unit.id);
    const reasons:string[]=[];
    if(!mapping) reasons.push('PRIMARY_MAPPING_MISSING');
    else if(mapping.practiceActivityId!==cap.primaryPracticeId) reasons.push('PRIMARY_MAPPING_DRIFT');

    const practice=mapping?practiceMap.get(mapping.practiceActivityId):undefined;
    if(!practice) reasons.push('PRACTICE_MISSING');
    const blocked=dispositionReason(cap.disposition);
    if(blocked) reasons.push(blocked);

    if(cap.disposition==='existing-engine'){
      if(mapping&&mapping.coverageStatus!=='full') reasons.push('MAPPING_NOT_FULL');
      if(practice&&practice.lifecycleStatus!=='ready') reasons.push('ACTIVITY_NOT_READY');
      if(mapping&&!Object.prototype.hasOwnProperty.call(input.configRegistry,mapping.practiceActivityId)) reasons.push('CONFIG_MISSING');
      if(practice&&practice.accessibilityProfile.length===0) reasons.push('ACCESSIBILITY_PROFILE_MISSING');
      if(practice&&practice.engineCompatibility.engine!==practice.type) reasons.push('ENGINE_COMPATIBILITY_MISMATCH');
    }

    const technicalReady=reasons.length===0;
    const approvals=practice?pendingApprovals(practice):[];
    return {
      learningUnitId:unit.id,
      legacyId:cap.legacyId,
      disposition:cap.disposition,
      practiceActivityId:cap.primaryPracticeId,
      technicalReady,
      releaseReady:technicalReady&&approvals.length===0,
      reasons,
      approvalPending:approvals,
    };
  });

  return {
    totalLearningUnits:rows.length,
    technicalReady:rows.filter(r=>r.technicalReady).length,
    releaseReady:rows.filter(r=>r.releaseReady).length,
    blockedByDisposition:{
      'needs-capability':rows.filter(r=>r.disposition==='needs-capability').length,
      'needs-content':rows.filter(r=>r.disposition==='needs-content').length,
      'remap-required':rows.filter(r=>r.disposition==='remap-required').length,
    },
    rows,
  };
}
