// LearningActivityReadiness (P1.2) — the ONE runtime readiness authority for practice activities.
//
// It consolidates the inputs the earlier models already used (lifecycleStatus, the compiled
// ActivityExecutionPlan, human approvals via effectiveApprovalState) into a single status + reasons:
//
//   READY     — released (lifecycle `ready`) with exactly one valid execution plan → may launch
//   PENDING   — valid plan but not released (planned / in review)             → strict: not launched
//   DISABLED  — no valid execution plan                                       → never launched
//   BLOCKED   — inconsistent content (released but unroutable / invalid)     → never launched
//
// Human review of an activity (technical/didactic/accessibility/chemistry) is RELEASE governance: it is
// reported as a reason (`ACTIVITY_REVIEW_PENDING`) and gates `releaseReady`, but it does not decide runtime
// launch — every activity in the current catalogue is still awaiting human review (see the impact report).

import type {UnitReadiness} from './unit-readiness.ts';

export type ReadinessStatus='READY'|'PENDING'|'DISABLED'|'BLOCKED';

export type ReadinessReason=
  |'ACTIVITY_NOT_RELEASED'
  |'ROUTE_NONE'
  |'ROUTE_INVALID'
  |'ACTIVITY_REVIEW_PENDING'
  |'ASSESSMENT_REVIEW_PENDING'
  |'ASSESSMENT_NOT_AVAILABLE'
  |'OUTCOME_MAPPING_MISSING'
  |'CHEMISTRY_REVIEW_REQUIRED'
  |'CONTENT_VERSION_INCOMPATIBLE';

/** Enforcement per activity: `strict` (pilot) launches only READY; `observe` keeps pre-P1.2 behaviour. */
export type ReadinessEnforcement='strict'|'observe';

export interface LearningActivityReadiness {
  activityId:string;
  status:ReadinessStatus;
  reasons:ReadinessReason[];
  enforcement:ReadinessEnforcement;
  /** READY and every human approval is in place (release governance view, reported only). */
  releaseReady:boolean;
}

export interface ReadinessInputActivity {
  id:string;
  lifecycleStatus:string;
  /** Result of effectiveApprovalState: which human reviews are still missing. */
  reviewPending:string[];
}

/** Pure derivation. `route` is the build-time routing verdict for the activity. */
export function deriveActivityReadiness(activity:ReadinessInputActivity,route:{ok:true}|{ok:false;code:string},enforcement:ReadinessEnforcement):LearningActivityReadiness{
  const reasons:ReadinessReason[]=[];
  let status:ReadinessStatus;
  const released=activity.lifecycleStatus==='ready';
  if(!route.ok){
    if(route.code==='ROUTE_NONE'&&!released){status='DISABLED';reasons.push('ROUTE_NONE');}
    else{status='BLOCKED';reasons.push(route.code==='ROUTE_NONE'?'ROUTE_NONE':'ROUTE_INVALID');}
  }else if(!released){status='PENDING';reasons.push('ACTIVITY_NOT_RELEASED');}
  else status='READY';
  if(activity.reviewPending.length){
    reasons.push('ACTIVITY_REVIEW_PENDING');
    if(activity.reviewPending.includes('chemistry')) reasons.push('CHEMISTRY_REVIEW_REQUIRED');
  }
  return {activityId:activity.id,status,reasons,enforcement,releaseReady:status==='READY'&&activity.reviewPending.length===0};
}

export type LaunchDecision={allowed:true}|{allowed:false;status:ReadinessStatus;reasons:ReadinessReason[]};

/**
 * The launch gate. Fail closed: DISABLED/BLOCKED never launch; PENDING launches only under `observe`
 * (legacy behaviour outside the pilot, reported in the impact analysis); unknown readiness never launches.
 */
export function launchDecision(readiness:LearningActivityReadiness|undefined):LaunchDecision{
  if(!readiness) return {allowed:false,status:'BLOCKED',reasons:['ROUTE_INVALID']};
  if(readiness.status==='READY') return {allowed:true};
  if(readiness.status==='PENDING'&&readiness.enforcement==='observe') return {allowed:true};
  return {allowed:false,status:readiness.status,reasons:readiness.reasons};
}

export const READINESS_PACK_PATH='activity-readiness.json';
export const READINESS_PACK_SCHEMA='kimyolab.activity-readiness.v1';

export interface ReadinessPack {
  schema:typeof READINESS_PACK_SCHEMA;
  /** LearningUnits in the controlled pilot (strict enforcement + learner-facing mastery). */
  pilotLearningUnitIds:string[];
  activities:LearningActivityReadiness[];
  units?:UnitReadiness[];
}

export function resolveReadiness(pack:unknown,activityId:string):LearningActivityReadiness|undefined{
  const p=pack as ReadinessPack;
  if(!p||p.schema!==READINESS_PACK_SCHEMA||!Array.isArray(p.activities)) throw new Error('READINESS_PACK_INVALID');
  const matches=p.activities.filter(a=>a?.activityId===activityId);
  if(matches.length>1) throw new Error('READINESS_PACK_CONFLICT');
  return matches[0];
}

/** Localized, learner-facing explanation. Machine codes never reach the UI (P1.2 §19/§33). */
export const READINESS_MESSAGES:Readonly<Record<ReadinessReason,string>>=Object.freeze({
  ACTIVITY_NOT_RELEASED:'Bu faoliyat hali tayyorlanmoqda. Tez orada ochiladi.',
  ROUTE_NONE:'Bu faoliyat hozircha mavjud emas.',
  ROUTE_INVALID:'Bu faoliyatni hozircha ochib bo‘lmaydi. Keyinroq urinib ko‘ring.',
  ACTIVITY_REVIEW_PENDING:'Faoliyat mutaxassislar tekshiruvidan o‘tmoqda.',
  ASSESSMENT_REVIEW_PENDING:'Savollar mutaxassislar tekshiruvidan o‘tmoqda. Hozircha mulohaza yozing.',
  ASSESSMENT_NOT_AVAILABLE:'Bu mavzu uchun test hali mavjud emas.',
  OUTCOME_MAPPING_MISSING:'Bu mavzu bo‘yicha test hali tayyorlanmoqda.',
  CHEMISTRY_REVIEW_REQUIRED:'Kimyoviy mazmun mutaxassis tekshiruvida.',
  CONTENT_VERSION_INCOMPATIBLE:'Ushbu mavzu yangilangan. Yangi versiya bo‘yicha qisqa tekshiruv kerak.',
});

export function readinessMessage(reasons:ReadinessReason[]):string{
  // The first blocking reason explains the state; review reasons are informational.
  const order:ReadinessReason[]=['ROUTE_INVALID','ROUTE_NONE','ACTIVITY_NOT_RELEASED','CONTENT_VERSION_INCOMPATIBLE','ASSESSMENT_REVIEW_PENDING','ASSESSMENT_NOT_AVAILABLE','OUTCOME_MAPPING_MISSING','CHEMISTRY_REVIEW_REQUIRED','ACTIVITY_REVIEW_PENDING'];
  const first=order.find(r=>reasons.includes(r));
  return first?READINESS_MESSAGES[first]:READINESS_MESSAGES.ROUTE_INVALID;
}
