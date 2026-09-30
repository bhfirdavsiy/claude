// Build-time compiler of the canonical readiness pack (P1.2). Node-only (uses the approval hash).
import {compileExecutionPlans,CONFIG_SOURCE_NAMES,deriveActivityExecutionPlan} from '../../src/runtime/practice-router/execution-plan.ts';
import {effectiveApprovalState} from '../../src/runtime/governance/approvals.ts';
import {deriveActivityReadiness,READINESS_PACK_SCHEMA,type LearningActivityReadiness,type ReadinessPack} from '../../src/domain/readiness/readiness.ts';
import type {UnitReadiness} from '../../src/domain/readiness/unit-readiness.ts';
import {deriveItemLifecycle,type AssessmentReviewRecord} from '../../src/domain/assessment/governance.ts';
import {RENDERER_CATALOG} from '../../src/renderers/catalog.ts';
import {selectCapability} from '../../src/renderers/registry.ts';
import type {RendererRequirement} from '../../src/renderers/contract.ts';
import {computeReviewHash} from '../../src/runtime/governance/approvals.ts';
import {releaseBasisHash,releaseStateOf,type ActivityReleaseDecision} from '../../src/domain/governance/release-decision.ts';

/** P1.4: is a registered renderer (per the catalog) compatible with the requirement? Same rule as the runtime registry. */
export function rendererAvailable(requirement:RendererRequirement):boolean{
  try{ selectCapability(RENDERER_CATALOG.map(capability=>({capability})),requirement); return true; }catch{ return false; }
}

export interface ReadinessSources {
  activities:any[];
  configs:Record<string,Record<string,unknown>>;
  mappings:any[];
  units:any[];
  bank:any;
  reviews:AssessmentReviewRecord[];
  pilot:{learningUnits:Array<{id:string}>};
  /** P2.0: validated human release decisions (the single release authority). Absent = none. */
  releaseDecisions?:ActivityReleaseDecision[];
}

/** Effective human release of an activity on its CURRENT basis (stale/missing → null). Build-time only. */
export function effectiveRelease(activity:any,config:unknown,records:readonly ActivityReleaseDecision[]|undefined):'RELEASED'|'DISABLED'|null{
  if(!records?.length) return null;
  const basis=releaseBasisHash({activityId:activity.id,version:activity.version,reviewHash:computeReviewHash(activity),config:config??null});
  const s=releaseStateOf(activity.id,basis,records).state;
  return s==='RELEASED'?'RELEASED':s==='DISABLED'?'DISABLED':null;
}

/** Human review state of an activity (hash-pinned via effectiveApprovalState): roles not yet approved, and roles that rejected it. */
export function reviewStateOf(activity:any):{pending:string[];rejected:string[]}{
  const a=effectiveApprovalState(activity);
  const pending:string[]=[];const rejected:string[]=[];
  const roles=[...(['technical','didactic','accessibility'] as const).map(r=>[r,a[r]] as const),...(a.chemistry==='not_applicable'?[]:[['chemistry',a.chemistry] as const])];
  for(const [role,record] of roles){ if(record.status==='rejected') rejected.push(role); else if(record.status!=='approved') pending.push(role); }
  return {pending,rejected};
}
export function reviewPendingOf(activity:any):string[]{ const s=reviewStateOf(activity); return [...s.pending,...s.rejected]; }

export function itemVerdicts(src:ReadinessSources){
  const unitById=new Map(src.units.map((u:any)=>[u.id,u]));
  return (src.bank.items??[]).map((item:any)=>{
    const unit:any=unitById.get(item.learningUnitId);
    const mapped=src.mappings.filter((m:any)=>m.learningUnitId===item.learningUnitId).flatMap((m:any)=>m.conceptIds??[]);
    return {item,verdict:deriveItemLifecycle(item,src.reviews,{unitOutcomeCount:unit?.learningOutcomes?.length??0,unitConceptIds:[...new Set([...(unit?.conceptIds??[]),...mapped])]})};
  });
}

export function compileReadiness(src:ReadinessSources):{pack:ReadinessPack&{units:UnitReadiness[]};fatal:string[]}{
  const fatal:string[]=[];
  const pilotIds=src.pilot.learningUnits.map(u=>u.id);
  for(const id of pilotIds) if(!src.units.some((u:any)=>u.id===id)) fatal.push(`PILOT_UNIT_UNKNOWN:${id}`);
  const strictActivities=new Set(src.mappings.filter((m:any)=>pilotIds.includes(m.learningUnitId)).map((m:any)=>m.practiceActivityId));
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,src.configs[n]??{}]));
  const {fatal:routeFatal}=compileExecutionPlans(src.activities,configs);
  for(const e of routeFatal) fatal.push(`ROUTING_${e.code}:${e.activityId}`);
  const activities:LearningActivityReadiness[]=src.activities.map((a:any)=>{
    const route=deriveActivityExecutionPlan(a,configs);
    const review=reviewStateOf(a);
    const requirement=route.ok?route.plan.rendererRequirement:undefined;
    const config=route.ok?(configs as any)[route.plan.configSource]?.[a.id]??null:null;
    return deriveActivityReadiness({id:a.id,lifecycleStatus:a.lifecycleStatus,reviewPending:review.pending,reviewRejected:review.rejected,release:effectiveRelease(a,config,src.releaseDecisions)},route.ok?{ok:true}:{ok:false,code:route.error.code},strictActivities.has(a.id)?'strict':'observe',requirement?{required:true,available:rendererAvailable(requirement)}:{required:false});
  }).sort((x:LearningActivityReadiness,y:LearningActivityReadiness)=>x.activityId.localeCompare(y.activityId));
  // pilot units must launch their primary practice under strict enforcement
  for(const id of pilotIds){
    const primary=src.mappings.find((m:any)=>m.learningUnitId===id&&m.role==='primary');
    const r=activities.find(a=>a.activityId===primary?.practiceActivityId);
    if(!r||r.runtime!=='READY') fatal.push(`PILOT_PRIMARY_NOT_READY:${id}`);
  }
  const verdicts=itemVerdicts(src);
  const units:UnitReadiness[]=src.units.map((u:any)=>{
    const mine=verdicts.filter((v:any)=>v.item.learningUnitId===u.id&&v.verdict.lifecycle!=='RETIRED');
    const approved=mine.filter((v:any)=>v.verdict.lifecycle==='APPROVED');
    const status=approved.length?'AVAILABLE':mine.length?'PENDING':'NONE';
    const reasons=status==='AVAILABLE'?[]:status==='PENDING'?[...new Set(mine.flatMap((v:any)=>v.verdict.reasons.filter((r:string)=>['ASSESSMENT_REVIEW_PENDING','CHEMISTRY_REVIEW_REQUIRED','OUTCOME_MAPPING_MISSING'].includes(r))))]:['ASSESSMENT_NOT_AVAILABLE'];
    return {learningUnitId:u.id,pilot:pilotIds.includes(u.id),assessment:{status,reasons:reasons as any}};
  });
  return {pack:{schema:READINESS_PACK_SCHEMA,pilotLearningUnitIds:pilotIds,activities,units},fatal};
}
