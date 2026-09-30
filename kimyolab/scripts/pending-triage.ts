// pending:triage (P1.3 §26) — why is each runtime-PENDING activity not launchable under strict enforcement,
// and what would it take? Every reason is DERIVED from code/content (routing, lifecycle, release overrides,
// human approvals, accessibility profile, guided-lab hardening); nothing is guessed and nothing is changed:
// the report never promotes an activity (pending → ready needs a recorded release decision by a person).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSources} from './learning-readiness.ts';
import {compileReadiness,reviewStateOf,type ReadinessSources} from './lib/readiness-compile.ts';
import {deriveActivityExecutionPlan,CONFIG_SOURCE_NAMES} from '../src/runtime/practice-router/execution-plan.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const TRIAGE_FILE='reports/pending-activity-triage.json';

/** Reasons that can be derived from the repository. Others (e.g. INTENTIONALLY_DEFERRED) need a recorded decision. */
export const PENDING_REASONS=['ROUTE_READY_BUT_LIFECYCLE_PENDING','CONTENT_NOT_RELEASED','REVIEW_MISSING','ACCESSIBILITY_PROFILE_MISSING','CHEMISTRY_GROUNDING_PARTIAL','ENGINE_CAPABILITY_MISSING','CONFIG_INCOMPLETE','INTENTIONALLY_DEFERRED'] as const;
export type PendingReason=typeof PENDING_REASONS[number];

export function buildPendingTriage(src:ReadinessSources,base=root){
  const {pack}=compileReadiness(src);
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,src.configs[n]??{}]));
  const read=(rel:string,fallback:any)=>fs.existsSync(path.join(base,rel))?JSON.parse(fs.readFileSync(path.join(base,rel),'utf8')):fallback;
  const overrides:any[]=read('content-src/activity-overrides.json',[]);
  const guidedTriage=new Map((read('reports/guided-lab-triage.json',{rows:[]}).rows??[]).map((r:any)=>[r.id,r]));
  const hardeningReport=read('reports/guided-lab-hardening.json',{rows:[],targetRows:[]});
  const hardening=new Map((hardeningReport.rows??[]).map((r:any)=>[r.id,r]));
  const hardeningTargets:any[]=hardeningReport.targetRows??[];
  const unitById=new Map(src.units.map((u:any)=>[u.id,u]));
  const pending=pack.activities.filter(a=>a.runtime==='PENDING');
  const rows=pending.map(r=>{
    const activity:any=src.activities.find((a:any)=>a.id===r.activityId);
    const route=deriveActivityExecutionPlan(activity,configs);
    const mappings=src.mappings.filter((m:any)=>m.practiceActivityId===activity.id).map((m:any)=>({learningUnitId:m.learningUnitId,role:m.role}));
    const grades=[...new Set(mappings.map((m:any)=>Number((unitById.get(m.learningUnitId) as any)?.grade)).filter(Number.isFinite))].sort();
    const release=overrides.find((o:any)=>o.activityId===activity.id&&o.lifecycleStatus!==undefined);
    const review=reviewStateOf(activity);
    const config:any=route.ok?(configs as any)[route.plan.configSource][activity.id]:undefined;
    const guided:any=guidedTriage.get(activity.id);const hard:any=hardening.get(activity.id);
    const totalSteps=Array.isArray(activity.legacyContent?.steps)?activity.legacyContent.steps.length:undefined;
    const reasons:PendingReason[]=[];
    const missing:string[]=[];
    if(route.ok&&activity.lifecycleStatus!=='ready') reasons.push('ROUTE_READY_BUT_LIFECYCLE_PENDING');
    if(!release){reasons.push('CONTENT_NOT_RELEASED');missing.push('a recorded release decision (content-src/activity-overrides.json lifecycleStatus) by the content owner');}
    if(review.pending.length||review.rejected.length){reasons.push('REVIEW_MISSING');missing.push(`human review: ${[...review.pending,...review.rejected].join(', ')}`);}
    if(!(activity.accessibilityProfile??[]).length){reasons.push('ACCESSIBILITY_PROFILE_MISSING');missing.push('an accessibility profile (keyboard / text alternatives) for the activity');}
    // Only the steps the chemistry coverage targets require count (the others are procedural by design).
    const targets=hardeningTargets.filter((t:any)=>t.activityId===activity.id);
    const ungrounded=targets.filter((t:any)=>!t.grounded);
    if(ungrounded.length){reasons.push('CHEMISTRY_GROUNDING_PARTIAL');missing.push(`chemistry grounding for target step(s) ${ungrounded.map((t:any)=>t.step).join(', ')}`);}
    if(!route.ok){reasons.push(route.error.code==='CAPABILITY_UNKNOWN'||route.error.code==='ENGINE_UNKNOWN'?'ENGINE_CAPABILITY_MISSING':'CONFIG_INCOMPLETE');missing.push(`a valid execution plan (${route.error.code})`);}
    const technicalFix=!route.ok||reasons.includes('ACCESSIBILITY_PROFILE_MISSING');
    const dependency=reasons.includes('ENGINE_CAPABILITY_MISSING')||reasons.includes('CONFIG_INCOMPLETE')?'engineering'
      :[...(reasons.includes('CHEMISTRY_GROUNDING_PARTIAL')?['chemistry-model']:[]),...(reasons.includes('ACCESSIBILITY_PROFILE_MISSING')?['accessibility authoring']:[]),'human review','release decision'].join(' + ');
    const next=[
      ...(reasons.includes('ACCESSIBILITY_PROFILE_MISSING')?['author the accessibility profile (and check the guided-step UI with keyboard/screen reader)']:[]),
      ...(reasons.includes('CHEMISTRY_GROUNDING_PARTIAL')?['finish chemistry grounding of the remaining steps (reaction or school-lab model) or mark them procedural']:[]),
      'technical + didactic + accessibility'+(review.pending.includes('chemistry')?' + chemistry':'')+' review by people',
      'explicit release decision by the content owner (activity-overrides) — never automatic',
    ];
    return {
      activityId:activity.id,title:activity.title,learningUnits:mappings,grades,engine:activity.type,
      lifecycle:activity.lifecycleStatus,runtime:r.runtime,content:r.content,
      runtimePlan:route.ok?{runtime:route.plan.runtime,configSource:route.plan.configSource,capability:route.plan.capability}:{error:route.error.code},
      interaction:guided?{guidedLabStatus:guided.status,hardeningStatus:hard?.status??null,groundedSteps:Number(hard?.groundedSteps??0),totalSteps:totalSteps??null,chemistryTargetSteps:targets.length,chemistryTargetsGrounded:targets.length-ungrounded.length,readiness:config?.readiness??null,virtualOnly:config?.virtualOnly??null}:null,
      whyPending:reasons,whatIsMissing:missing,
      technicalFix,contentReview:[...review.pending,...review.rejected],releaseDecision:release?'RECORDED':'NONE_RECORDED',
      dependencyCategory:dependency,recommendedNextAction:next,
      evidence:['content-src/practice-activities.json (lifecycleStatus, approvals, accessibilityProfile)','content-src/activity-overrides.json (release decisions)',`content-src/activity-configs/${route.ok?route.plan.configSource:'?'}.json`,'reports/guided-lab-triage.json','reports/guided-lab-hardening.json'],
    };
  });
  const byReason=Object.fromEntries(PENDING_REASONS.map(k=>[k,rows.filter(r=>r.whyPending.includes(k)).length]));
  const count=(f:(r:any)=>string)=>rows.reduce((m:any,r)=>{const k=f(r);m[k]=(m[k]??0)+1;return m;},{});
  return {
    schema:'kimyolab.pending-activity-triage.v1',
    semantics:'Triage of every runtime-PENDING activity. Reasons are derived from repository facts only; no status was changed. pending → ready requires a recorded release decision by a person (and, for release governance, human approvals).',
    total:rows.length,
    learningUnitsAffected:new Set(rows.flatMap(r=>r.learningUnits.map((m:any)=>m.learningUnitId))).size,
    byReason,
    notObserved:PENDING_REASONS.filter(k=>byReason[k]===0),
    byEngine:count(r=>r.engine),byConfigSource:count(r=>r.runtimePlan.configSource??'none'),
    byGuidedLabStatus:count(r=>r.interaction?.guidedLabStatus??'none'),
    byDependency:count(r=>r.dependencyCategory),
    globalStrictEnforcement:{enabled:false,note:'Stays OFF: enabling it would close these activities in the units listed; decide per activity after review and release.'},
    rows:rows.sort((a,b)=>a.activityId.localeCompare(b.activityId)),
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const triage=buildPendingTriage(loadSources());
  fs.writeFileSync(path.join(root,TRIAGE_FILE),`${JSON.stringify(triage,null,2)}\n`,'utf8');
  console.log(JSON.stringify({total:triage.total,learningUnitsAffected:triage.learningUnitsAffected,byReason:triage.byReason,byDependency:triage.byDependency}));
}
