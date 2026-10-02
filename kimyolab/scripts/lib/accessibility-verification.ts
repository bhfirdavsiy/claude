// P2.7 — accessibility verification states (ADR-P2-008). ONE rule turns the committed browser facts
// (reports/accessibility-browser-evidence.json, re-measured by tests/e2e/accessibility-sweep.spec.mjs on every verify)
// into a per-activity state. The learning-depth baseline and the P2.7 reports both use this rule, so no report can
// call an activity accessible on a different basis.
//
//   NOT_APPLICABLE — the activity cannot be launched (nothing for a learner to operate)
//   FAILED         — a launchable activity with a failing automated check, or with no browser evidence at all
//   BLOCKED        — every automated check passes, but the CONTENT lacks something only a human can author
//                    (a meaningful control label, a described colour observation) — BLOCKED_BY_CONTENT
//   VERIFIED       — every applicable automated check passes through the real keyboard flow (AUTOMATED_VERIFIED)
//
// VERIFIED is automated technical verification only. Human accessibility review is a separate, factual field that
// stays NOT_REVIEWED until a real reviewer records a decision; nothing here can set it.
import fs from 'node:fs';
import path from 'node:path';

export const A11Y_EVIDENCE='reports/accessibility-browser-evidence.json';
export const A11Y_STATES=['VERIFIED','FAILED','BLOCKED','NOT_APPLICABLE'] as const;
export type A11yState=typeof A11Y_STATES[number];
/** issues that only a content author can resolve (labels / descriptions are content, never invented here) */
export const CONTENT_ISSUE=/^CONTENT_/;

export interface A11yEvidenceRow { activityId:string; family:string; checks:Record<string,'PASS'|'FAIL'|'NOT_APPLICABLE'>; issues:string[] }

export function readA11yEvidence(root:string):{activities:A11yEvidenceRow[];notLaunchable:Array<{activityId:string;reason:string}>;standaloneParity:any[];method?:any}|null{
  const file=path.join(root,A11Y_EVIDENCE);
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
}

export function a11yStateOf(row:A11yEvidenceRow|undefined,launchable:boolean):{state:A11yState;level:'AUTOMATED_VERIFIED'|null;blockedBy:string[];failing:string[]}{
  if(!launchable) return {state:'NOT_APPLICABLE',level:null,blockedBy:[],failing:[]};
  if(!row) return {state:'FAILED',level:null,blockedBy:[],failing:['NO_BROWSER_EVIDENCE']};
  const failing=Object.entries(row.checks).filter(([,v])=>v==='FAIL').map(([k])=>k);
  const blockedBy=row.issues.filter(i=>CONTENT_ISSUE.test(i));
  if(failing.length) return {state:'FAILED',level:null,blockedBy,failing};
  if(blockedBy.length) return {state:'BLOCKED',level:null,blockedBy,failing};
  return {state:'VERIFIED',level:'AUTOMATED_VERIFIED',blockedBy,failing};
}

/** learning-depth `accessibility` field for one activity, derived from the same rule */
export function a11yForDepth(evidence:ReturnType<typeof readA11yEvidence>,activityId:string,launchable:boolean,declaredProfile:string[]){
  const row=evidence?.activities.find(x=>x.activityId===activityId);
  const s=a11yStateOf(row,launchable);
  const v=(k:string)=>row?.checks[k]==='PASS'?'VERIFIED':row?.checks[k]==='NOT_APPLICABLE'?'NOT_APPLICABLE':'UNKNOWN';
  return {source:s.state==='VERIFIED'?'automated browser sweep':'automated browser sweep — not verified',state:s.state,level:s.level,humanReview:'NOT_REVIEWED',
    keyboard:v('keyboard'),screenReader:row&&['accessibleName','statusAnnouncement','srTextState'].every(k=>row.checks[k]==='PASS')?'VERIFIED':'UNKNOWN',
    screenReaderSummary:v('srTextState'),nonColor:v('nonColor'),nonColorCues:v('nonColor'),reducedMotion:v('reducedMotion'),nonVisualAlternative:v('srTextState'),
    failing:s.failing,blockedBy:s.blockedBy,declaredProfile};
}
