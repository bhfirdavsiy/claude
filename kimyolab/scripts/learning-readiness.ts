// learning:readiness (P1.2 §40) — fails CI on FATAL readiness inconsistencies; known pending content is
// reported, not failed. Also writes the readiness/mastery baseline reports.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileReadiness,itemVerdicts,type ReadinessSources} from './lib/readiness-compile.ts';
import {parseReleaseRegister} from '../src/domain/governance/release-decision.ts';
import {validateReviewRecord,assessmentItemHash} from '../src/domain/assessment/governance.ts';
import {launchDecision,isReleaseReady} from '../src/domain/readiness/readiness.ts';
import {CONFIG_SOURCE_NAMES} from '../src/runtime/practice-router/execution-plan.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

export function loadSources(base=root):ReadinessSources{
  const r=(rel:string)=>JSON.parse(fs.readFileSync(path.join(base,rel),'utf8'));
  return {
    activities:r('content-src/practice-activities.json'),
    configs:Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,fs.existsSync(path.join(base,`content-src/activity-configs/${n}.json`))?r(`content-src/activity-configs/${n}.json`):{}])),
    mappings:r('content-src/mapping-links.json'),units:r('content-src/learning-units.json'),
    bank:r('content-src/assessment-items.json'),reviews:r('content-src/assessment-reviews.json').records??[],
    pilot:r('content-src/learning-pilot.json'),
    // P2.0: the release register is the single release authority (validated records only)
    releaseDecisions:fs.existsSync(path.join(base,'content-src/release-decisions.json'))?parseReleaseRegister(r('content-src/release-decisions.json')).records:[],
  };
}

export function evaluateLearningReadiness(src:ReadinessSources,shippedPack?:unknown){
  const fatal:string[]=[];const warnings:string[]=[];
  const {pack,fatal:compileFatal}=compileReadiness(src);
  fatal.push(...compileFatal);
  if(shippedPack!==undefined&&JSON.stringify(shippedPack)!==JSON.stringify(pack)) fatal.push('READINESS_PACK_STALE: run npm run content:pack');
  // human-only approval: an authored "approved" without a current human record is an inconsistency
  const verdicts=itemVerdicts(src);
  for(const {item,verdict} of verdicts){
    for(const role of ['chemistry','didactic'] as const) if(item.review?.[role]==='approved'&&verdict.review[role]!=='approved') fatal.push(`ASSESSMENT_APPROVAL_WITHOUT_REVIEW_RECORD:${item.id}:${role}`);
    const unit=src.units.find((u:any)=>u.id===item.learningUnitId);
    const mapped=src.mappings.filter((m:any)=>m.learningUnitId===item.learningUnitId).flatMap((m:any)=>m.conceptIds??[]);
    for(const c of item.conceptIds??[]) if(!(unit?.conceptIds??[]).includes(c)&&!mapped.includes(c)) fatal.push(`ASSESSMENT_CONCEPT_NOT_IN_UNIT:${item.id}:${c}`);
    if(!(item.outcomeIds??[]).length) (verdict.lifecycle==='APPROVED'?fatal:warnings).push(`OUTCOME_MAPPING_MISSING:${item.id}`);
  }
  for(const record of src.reviews){
    const issues=validateReviewRecord(record);
    if(issues.length) fatal.push(...issues.map(i=>`REVIEW_REGISTER_${i}`));
    const item=src.bank.items.find((i:any)=>i.id===record.itemId);
    if(!item) fatal.push(`REVIEW_REGISTER_ITEM_UNKNOWN:${record.itemId}`);
    else if(assessmentItemHash(item)!==record.itemHash) warnings.push(`REVIEW_RECORD_STALE:${record.itemId}:${record.role}`);
  }
  return {pack,verdicts,fatal:[...new Set(fatal)],warnings:[...new Set(warnings)]};
}

export function buildReports(src:ReadinessSources,result:ReturnType<typeof evaluateLearningReadiness>){
  const {pack,verdicts}=result;
  const byId=new Map(src.activities.map((a:any)=>[a.id,a]));
  // runtime dimension only — "ready" here means technically launchable, NOT approved by people
  const count=(rows:any[])=>({total:rows.length,ready:rows.filter(r=>r.runtime==='READY').length,pending:rows.filter(r=>r.runtime==='PENDING').length,disabled:rows.filter(r=>r.runtime==='DISABLED').length,blocked:rows.filter(r=>r.runtime==='BLOCKED').length});
  const contentCount=(rows:any[])=>({approved:rows.filter(r=>r.content==='APPROVED').length,reviewPending:rows.filter(r=>r.content==='REVIEW_PENDING').length,rejected:rows.filter(r=>r.content==='REJECTED').length});
  const group=(key:(a:any)=>string)=>{const out:Record<string,any>={};for(const r of pack.activities){const k=key(byId.get(r.activityId));(out[k]??=[]).push(r);}return Object.fromEntries(Object.entries(out).sort().map(([k,v])=>[k,count(v as any[])]));};
  const unitOf=new Map<string,any[]>();
  for(const m of src.mappings){const r=pack.activities.find(a=>a.activityId===m.practiceActivityId);if(r)(unitOf.get(m.learningUnitId)??unitOf.set(m.learningUnitId,[]).get(m.learningUnitId)!).push({...r,role:m.role});}
  const unitState=(u:any)=>{const rows=unitOf.get(u.id)??[];const primary=rows.find(r=>r.role==='primary');if(!primary||primary.runtime!=='READY')return 'blocked';return rows.every(r=>r.runtime==='READY')?'fully_ready':'partially_ready';};
  const byUnit=Object.fromEntries(src.units.map((u:any)=>[u.id,{state:unitState(u),...count(unitOf.get(u.id)??[])}]));
  const states=Object.values(byUnit).map((x:any)=>x.state);
  // what global strict enforcement WOULD do today (decision input — not enabled)
  const wouldBlock=pack.activities.filter(a=>a.runtime!=='READY'&&launchDecision({...a,enforcement:'strict'}).allowed===false&&launchDecision(a).allowed);
  const unitsLosingSupporting=new Set(src.mappings.filter((m:any)=>wouldBlock.some(a=>a.activityId===m.practiceActivityId)).map((m:any)=>m.learningUnitId));
  const impact={
    semantics:'activities/byGrade/byEngine/units count the RUNTIME dimension (technically launchable). Human content approval is the separate `content` dimension; runtime READY never implies APPROVED.',
    activities:count(pack.activities),
    content:{...contentCount(pack.activities),runtimeReadyButNotApproved:pack.activities.filter(a=>a.runtime==='READY'&&a.content!=='APPROVED').length,releaseReady:pack.activities.filter(isReleaseReady).length},
    byGrade:group(a=>`grade-${String(a.id).match(/\.(7|8|9|10|11)\./)?.[1]??'?'}`),
    byEngine:group(a=>a.type),
    units:{total:src.units.length,fullyReady:states.filter(s=>s==='fully_ready').length,partiallyReady:states.filter(s=>s==='partially_ready').length,blocked:states.filter(s=>s==='blocked').length},
    byLearningUnit:byUnit,
    activityReviewPending:pack.activities.filter(a=>a.reasons.includes('ACTIVITY_REVIEW_PENDING')).length,
    globalStrictEnforcement:{
      enabled:false,
      wouldBlockCurrentlyLaunchable:wouldBlock.map(a=>a.activityId),
      learningUnitsAffected:unitsLosingSupporting.size,
      decision:'NOT enabled globally: it would hide currently launchable (pending, observe-mode) supporting activities in many units; C4 is enforced strictly only in the pilot.',
    },
    pilot:{learningUnitIds:pack.pilotLearningUnitIds,strictActivities:pack.activities.filter(a=>a.enforcement==='strict').map(a=>({activityId:a.activityId,runtime:a.runtime,content:a.content}))},
  };
  const lifecycle=(l:string)=>verdicts.filter((v:any)=>v.verdict.lifecycle===l).length;
  const assessment={
    totalLearningUnits:src.units.length,
    unitsWithObjectiveAssessment:pack.units.filter(u=>u.assessment.status==='AVAILABLE').length,
    unitsWithPendingAssessment:pack.units.filter(u=>u.assessment.status==='PENDING').length,
    approvedItems:lifecycle('APPROVED'),pendingItems:lifecycle('REVIEW_PENDING'),draftItems:lifecycle('DRAFT'),retiredItems:lifecycle('RETIRED'),
    itemsWithConceptMapping:src.bank.items.filter((i:any)=>(i.conceptIds??[]).length).length,
    itemsWithOutcomeMapping:src.bank.items.filter((i:any)=>(i.outcomeIds??[]).length).length,
    itemsRuntimeReady:lifecycle('APPROVED'),itemsBlocked:src.bank.items.length-lifecycle('APPROVED'),
    blockedReasons:verdicts.flatMap((v:any)=>v.verdict.reasons).reduce((m:any,r:string)=>(m[r]=(m[r]??0)+1,m),{}),
    humanReviewRecords:src.reviews.length,
    itemsWithProvenance:src.bank.items.filter((i:any)=>i.provenance).length,
    bankVersion:src.bank.version,
  };
  const readyPrimary=new Set(src.units.filter((u:any)=>{const p=(unitOf.get(u.id)??[]).find(r=>r.role==='primary');return p?.runtime==='READY';}).map((u:any)=>u.id));
  const mastery={
    totalLU:src.units.length,
    LUWithMasteryEvidenceSource:readyPrimary.size,
    LUWithObjectiveAssessment:assessment.unitsWithObjectiveAssessment,
    LUEligibleForMasteryDisplay:pack.pilotLearningUnitIds.filter(id=>readyPrimary.has(id)).length,
    LUWhereMasteredIsReachable:pack.units.filter(u=>u.assessment.status==='AVAILABLE'&&readyPrimary.has(u.learningUnitId)).length,
    LUBlockedByMissingAssessment:pack.units.filter(u=>u.assessment.status!=='AVAILABLE').length,
    LUBlockedByReadiness:src.units.length-readyPrimary.size,
    pilotLU:pack.pilotLearningUnitIds,
    note:'Mastery is displayed only for pilot units. Without an approved objective assessment a unit can never show "O‘zlashtirilgan" (minimum-evidence rule).',
  };
  return {impact,assessment,mastery};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const src=loadSources();
  const pointer=read('public/content/manifest.json');
  const shippedFile=path.join(root,'public/content',pointer.activeVersion,'activity-readiness.json');
  const result=evaluateLearningReadiness(src,fs.existsSync(shippedFile)?JSON.parse(fs.readFileSync(shippedFile,'utf8')):undefined);
  const reports=buildReports(src,result);
  // Deterministic: no timestamp, so an unchanged catalogue produces no diff on every verify.
  const write=(rel:string,body:unknown)=>fs.writeFileSync(path.join(root,rel),`${JSON.stringify(body,null,2)}\n`,'utf8');
  write('reports/readiness-enforcement-impact.json',reports.impact);
  write('reports/assessment-runtime-readiness.json',reports.assessment);
  write('reports/mastery-ux-coverage.json',reports.mastery);
  console.log(JSON.stringify({fatal:result.fatal.length,warnings:result.warnings.length,activities:reports.impact.activities,units:reports.impact.units}));
  if(result.fatal.length){for(const f of result.fatal)console.error(f);process.exitCode=1;}
}
