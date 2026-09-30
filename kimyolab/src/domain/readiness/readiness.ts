// LearningActivityReadiness (P1.2, split into two dimensions in the P1.2 closeout) — the ONE readiness
// authority for practice activities. It has two INDEPENDENT dimensions and they are never merged into one word:
//
// runtime — can the platform launch it? (lifecycleStatus + the compiled ActivityExecutionPlan)
//   READY     — released (lifecycle `ready`) with exactly one valid execution plan → may launch
//   PENDING   — valid plan but not released (planned)                          → strict: not launched
//   DISABLED  — no valid execution plan                                       → never launched
//   BLOCKED   — inconsistent content (released but unroutable / invalid)     → never launched
//
// content — have people approved it? (human approval records via effectiveApprovalState, hash-pinned)
//   APPROVED        — every required human review (technical, didactic, accessibility, chemistry if
//                     applicable) approved THIS version/hash
//   REVIEW_PENDING  — at least one required review is missing or was invalidated by a content change
//   REJECTED        — at least one reviewer rejected it
//
// runtime READY ≠ content APPROVED. A practice activity may be launchable while its human review is pending:
// practice produces practice evidence only and can never make a unit "mastered" on its own (that needs an
// APPROVED objective assessment — ADR-P1-003 §4, ADR-P1-004 §1). Objective assessment is different: it is
// shown to learners only when the items are APPROVED by people (unit-readiness.ts, assessment governance).

import type {UnitReadiness} from './unit-readiness.ts';

export type RuntimeReadiness='READY'|'PENDING'|'DISABLED'|'BLOCKED';
/** Aggregate of the existing per-role ApprovalStatus (pending/approved/rejected) — not a new taxonomy. */
export type ContentApprovalState='APPROVED'|'REVIEW_PENDING'|'REJECTED';

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
  /** Technical launchability. Says NOTHING about human approval. */
  runtime:RuntimeReadiness;
  /** Human content approval. Says NOTHING about launchability. */
  content:ContentApprovalState;
  reasons:ReadinessReason[];
  enforcement:ReadinessEnforcement;
}

/** Release-governance view: launchable AND approved by people. Reported only; never used as a launch gate. */
export function isReleaseReady(r:Pick<LearningActivityReadiness,'runtime'|'content'>):boolean{
  return r.runtime==='READY'&&r.content==='APPROVED';
}

export interface ReadinessInputActivity {
  id:string;
  lifecycleStatus:string;
  /** Result of effectiveApprovalState: which human reviews are still missing (or invalidated). */
  reviewPending:string[];
  /** Result of effectiveApprovalState: which human reviews rejected the current version. */
  reviewRejected?:string[];
}

/** Pure derivation. `route` is the build-time routing verdict for the activity. */
export function deriveActivityReadiness(activity:ReadinessInputActivity,route:{ok:true}|{ok:false;code:string},enforcement:ReadinessEnforcement):LearningActivityReadiness{
  const reasons:ReadinessReason[]=[];
  let status:RuntimeReadiness;
  const released=activity.lifecycleStatus==='ready';
  if(!route.ok){
    if(route.code==='ROUTE_NONE'&&!released){status='DISABLED';reasons.push('ROUTE_NONE');}
    else{status='BLOCKED';reasons.push(route.code==='ROUTE_NONE'?'ROUTE_NONE':'ROUTE_INVALID');}
  }else if(!released){status='PENDING';reasons.push('ACTIVITY_NOT_RELEASED');}
  else status='READY';
  const rejected=activity.reviewRejected??[];
  const notApproved=[...activity.reviewPending,...rejected];
  if(notApproved.length){
    reasons.push('ACTIVITY_REVIEW_PENDING');
    if(notApproved.includes('chemistry')) reasons.push('CHEMISTRY_REVIEW_REQUIRED');
  }
  const content:ContentApprovalState=rejected.length?'REJECTED':activity.reviewPending.length?'REVIEW_PENDING':'APPROVED';
  return {activityId:activity.id,runtime:status,content,reasons,enforcement};
}

export type LaunchDecision={allowed:true}|{allowed:false;runtime:RuntimeReadiness;reasons:ReadinessReason[]};

/**
 * The launch gate — decided by the RUNTIME dimension. The content dimension is release governance, with one
 * exception: content REJECTED by a human reviewer never launches (a pending review does not block practice).
 * Fail closed: DISABLED/BLOCKED never launch; PENDING launches only under `observe` (legacy behaviour outside
 * the pilot, reported in the impact analysis); unknown readiness never launches.
 */
export function launchDecision(readiness:LearningActivityReadiness|undefined):LaunchDecision{
  if(!readiness) return {allowed:false,runtime:'BLOCKED',reasons:['ROUTE_INVALID']};
  // the one place content decides: a person explicitly REJECTED this version → it is not shown to learners
  if(readiness.content==='REJECTED') return {allowed:false,runtime:readiness.runtime,reasons:readiness.reasons};
  if(readiness.runtime==='READY') return {allowed:true};
  if(readiness.runtime==='PENDING'&&readiness.enforcement==='observe') return {allowed:true};
  return {allowed:false,runtime:readiness.runtime,reasons:readiness.reasons};
}

export const READINESS_PACK_PATH='activity-readiness.json';
export const READINESS_PACK_SCHEMA='kimyolab.activity-readiness.v2';

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
