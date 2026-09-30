// Release decisions (P1.9), build side: the machine facts a content owner needs to decide (eligibility, basis hash,
// dependencies) and the validation of their decision. Nothing here decides a release or changes a lifecycle.
import fs from 'node:fs';
import path from 'node:path';
import {loadSources} from '../learning-readiness.ts';
import {compileReadiness,rendererAvailable,type ReadinessSources} from './readiness-compile.ts';
import {deriveActivityExecutionPlan,CONFIG_SOURCE_NAMES} from '../../src/runtime/practice-router/execution-plan.ts';
import {computeReviewHash,effectiveApprovalState} from '../../src/runtime/governance/approvals.ts';
import {releaseBasisHash,releaseEligibility,releaseStateOf,parseReleaseRegister,validateReleaseRecord,RELEASE_REGISTER_SCHEMA,type ActivityReleaseDecision} from '../../src/domain/governance/release-decision.ts';
import {loadKb,buildAssertions} from './chemistry-kb.ts';
import {parseReviewRegister,reviewStateOf} from '../../src/domain/chemistry/kb-review.ts';

export const RELEASE_REGISTER_FILE='content-src/release-decisions.json';
export const RELEASE_PACKET_DIR='review-packets/release-decisions';
const readOptional=(root:string,rel:string,fallback:any)=>fs.existsSync(path.join(root,rel))?JSON.parse(fs.readFileSync(path.join(root,rel),'utf8')):fallback;

export function releaseRecords(root:string){
  return parseReleaseRegister(readOptional(root,RELEASE_REGISTER_FILE,{schema:RELEASE_REGISTER_SCHEMA,records:[]}));
}

/** Every activity with its release basis, machine eligibility and current human release state. */
export function releaseEntries(root:string,src:ReadinessSources=loadSources(root)){
  const {pack}=compileReadiness(src);
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,src.configs[n]??{}]));
  const kb=loadKb(root);
  const chemReg=parseReviewRegister(kb.register);
  const assertions=buildAssertions(kb);
  const records=releaseRecords(root).records;
  const pilotIds=new Set(src.pilot.learningUnits.map((u:any)=>u.id));
  return src.activities.map((a:any)=>{
    const route=deriveActivityExecutionPlan(a,configs);
    const r=pack.activities.find(x=>x.activityId===a.id)!;
    const config=route.ok?(configs as any)[route.plan.configSource]?.[a.id]??null:null;
    const basisHash=releaseBasisHash({activityId:a.id,version:a.version,reviewHash:computeReviewHash(a),config});
    const approvals=effectiveApprovalState(a);
    const related=assertions.filter(x=>x.affectedActivities.includes(a.id));
    const stale=related.filter(x=>reviewStateOf(x,chemReg.records).state==='stale').map(x=>x.id);
    const requirement=route.ok?route.plan.rendererRequirement:undefined;
    const eligibility=releaseEligibility({routeOk:route.ok,runtime:r.runtime,runtimeReasons:r.reasons,rendererRequired:Boolean(requirement),rendererAvailable:requirement?rendererAvailable(requirement):true,content:r.content,accessibilityApproved:approvals.accessibility.status==='approved',staleChemistryAssertions:stale});
    const learningUnits=[...new Set(src.mappings.filter((m:any)=>m.practiceActivityId===a.id).map((m:any)=>m.learningUnitId))].sort() as string[];
    const st=releaseStateOf(a.id,basisHash,records);
    const role=(x:any)=>x==='not_applicable'?'not_applicable':x.status;
    return {
      activityId:a.id,title:a.title,learningUnits,pilot:learningUnits.some(u=>pilotIds.has(u)),
      lifecycleStatus:a.lifecycleStatus,runtime:r.runtime,runtimeReasons:r.reasons,content:r.content,
      reviews:{technical:role(approvals.technical),didactic:role(approvals.didactic),accessibility:role(approvals.accessibility),chemistry:role(approvals.chemistry)},
      accessibilityProfile:a.accessibilityProfile??[],
      route:route.ok?{ok:true,engine:route.plan.engine,runtime:route.plan.runtime,configSource:route.plan.configSource}:{ok:false,code:route.error.code,detail:route.error.detail},
      engine:a.type,
      renderer:requirement?{capability:requirement.capability,available:rendererAvailable(requirement)}:{capability:null,available:true},
      dependencies:{chemistryAssertions:related.map(x=>x.id),staleChemistryAssertions:stale},
      basisHash,eligibility,
      releaseState:st.state,lastDecision:st.record?{decision:st.record.decision,reviewerId:st.record.reviewerId,decidedAt:st.record.decidedAt}:null,
    };
  }).sort((x:any,y:any)=>x.activityId.localeCompare(y.activityId));
}
export type ReleaseEntry=ReturnType<typeof releaseEntries>[number];

/** Validation of release decisions against the CURRENT basis and eligibility (writes nothing). */
export function validateReleaseDecisions(root:string,decisions:any[]):string[]{
  const entries=new Map(releaseEntries(root).map(e=>[e.activityId,e]));
  const issues:string[]=[];
  for(const d of decisions){
    issues.push(...validateReleaseRecord(d));
    const e=entries.get(d?.activityId);
    if(!e){ issues.push(`RELEASE_ACTIVITY_UNKNOWN:${d?.activityId}`); continue; }
    if(e.basisHash!==d.basisHash) issues.push(`RELEASE_DECISION_STALE:${d.activityId}`);
    else if(d.decision==='RELEASE'&&e.eligibility.status!=='ELIGIBLE') issues.push(`RELEASE_NOT_ELIGIBLE:${d.activityId}:${e.eligibility.reasons.join('|')}`);
  }
  const seen=new Map<string,string>();
  for(const d of decisions){ const k=String(d?.activityId), v=JSON.stringify([d?.decision,d?.reviewerId]); if(seen.has(k)&&seen.get(k)!==v) issues.push(`RELEASE_CONFLICT:${k}`); seen.set(k,v); }
  return [...new Set(issues)];
}

/** The ONLY writer of content-src/release-decisions.json (called by review:import, run by a person). */
export function importReleaseDecisions(root:string,decisions:any[]):{imported:number;issues:string[]}{
  const issues=validateReleaseDecisions(root,decisions);
  if(issues.length) return {imported:0,issues};
  if(!decisions.length) return {imported:0,issues:[]};
  const file=path.join(root,RELEASE_REGISTER_FILE);
  const register=readOptional(root,RELEASE_REGISTER_FILE,{schema:RELEASE_REGISTER_SCHEMA,records:[]});
  register.records.push(...decisions.map((d:ActivityReleaseDecision)=>({activityId:d.activityId,basisHash:d.basisHash,decision:d.decision,reviewerId:d.reviewerId,role:d.role,decidedAt:d.decidedAt,...(d.comment?{comment:d.comment}:{})})));
  fs.writeFileSync(file,`${JSON.stringify(register,null,2)}\n`,'utf8');
  return {imported:decisions.length,issues:[]};
}
