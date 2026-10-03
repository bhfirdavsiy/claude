// a11y:report (P2.7) — writes reports/accessibility-verification.json and reports/accessibility-gap-summary.json from
// the committed browser facts (reports/accessibility-browser-evidence.json, re-measured on every `npm run verify` by
// tests/e2e/accessibility-sweep.spec.mjs) and the learning-depth baseline. Deterministic; measurement only — nothing
// here changes content, chemistry, answers, progress weights or any human decision.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readA11yEvidence,a11yStateOf,A11Y_EVIDENCE,A11Y_STATES} from './lib/accessibility-verification.ts';
import {bundle} from './lib/computed-model-interaction.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const uniq=<T>(xs:T[])=>[...new Set(xs)];

/** P2.6 closing numbers (reports/computed-model-interaction-expansion.json `after`) — the P2.7 starting point. */
const BUNDLE_BEFORE={learnerModules:162,learnerModuleBytes:697911,rendererModules:13,rendererBytes:70721,standaloneBytes:5684732,cssBytes:32231};
/** P2.6 closing accessibility facts (learning-depth baseline before P2.7): renderer-contract declarations only. */
const BEFORE={verifiedByRendererContract:7,legacyUnknown:138,unitsWithAccessibilityGap:116};
/** The SAME sweep harness run against the P2.6 code (main @ 2e80fd0) before any P2.7 fix — measured once, recorded
 *  here as history (the P2.6 UI no longer exists to re-measure). Activities failing each check, of 145. */
const BEFORE_SWEEP={base:'2e80fd0',launchable:145,verified:0,failed:145,failingChecks:{textScale:145,errorAnnouncement:72,noFocusLoss:61,keyboard:54,noKeyboardTrap:54,retry:54,srTextState:54,accessibleName:51,nonColor:16,reflow320:16,targetSize:11,wrongAnswer:10,statusAnnouncement:6,reflow375:5},
  issues:{TEXT_SCALE_200:145,ERROR_NOT_ANNOUNCED:72,FOCUS_LOST_AFTER_UPDATE:61,KEYBOARD_UNREACHABLE:54,AMBIGUOUS_BUTTON_NAME:51,TARGET_SMALL:11,ERROR_NOT_BOUND_TO_CONTROL:10,WRONG_ANSWER_NOT_ANNOUNCED:10,HORIZONTAL_SCROLL:10,CLIPPED:7}};

const SPEC='tests/e2e/accessibility-sweep.spec.mjs';
const FAMILY_SPECS:Record<string,string[]>={
  'form-simulation':['tests/e2e/accessibility-families.spec.mjs','tests/e2e/learner-interaction.spec.mjs'],
  trainer:['tests/e2e/accessibility-families.spec.mjs'],calculation:['tests/e2e/accessibility-families.spec.mjs'],case:['tests/e2e/accessibility-families.spec.mjs'],
  'guided-experiment':['tests/e2e/accessibility-families.spec.mjs'],'scripted-experiment':['tests/e2e/accessibility-families.spec.mjs'],
  'renderer:atom-builder':['tests/e2e/renderer-atom.spec.mjs'],'renderer:hydrolysis-medium':['tests/e2e/renderer-hydrolysis.spec.mjs','tests/e2e/accessibility-families.spec.mjs'],
  'renderer:ionic-precipitation':['tests/e2e/renderer-ionic.spec.mjs'],'renderer:condition-prediction':['tests/e2e/renderer-condition.spec.mjs','tests/e2e/accessibility-families.spec.mjs'],
};

export function buildAccessibilityReports(){
  const baseline=read('reports/learning-depth-baseline.json');
  const evidence=readA11yEvidence(root);
  if(!evidence) throw new Error(`A11Y_EVIDENCE_MISSING: run npm run a11y:sweep (${A11Y_EVIDENCE})`);
  const byId=new Map(evidence.activities.map(r=>[r.activityId,r]));
  const pick=(row:any,keys:string[])=>{ if(!row) return 'NO_EVIDENCE'; const v=keys.map(k=>row.checks[k]); return v.includes('FAIL')?'FAIL':v.every(x=>x==='NOT_APPLICABLE')?'NOT_APPLICABLE':'PASS'; };
  const activities=baseline.activities.map((a:any)=>{
    const launchable=a.canSucceed!=='NOT_LAUNCHABLE';
    const row:any=byId.get(a.activityId);
    const s=a11yStateOf(row,launchable);
    return {
      activityId:a.activityId,learningUnits:a.learningUnits,activityType:a.type,
      family:row?.family??null,renderer:a.renderer.kind==='registry'?`registry:${a.renderer.capability}`:a.renderer.kind==='legacy'?`legacy:${a.renderer.uiKind}`:'none',
      interactionDepth:{depth:a.depth,interaction:a.interaction},
      state:s.state,level:s.level,humanAccessibilityReview:'NOT_REVIEWED',
      ...(launchable?{
        keyboardOperability:pick(row,['keyboard','noKeyboardTrap','noFocusLoss','retry']),
        focusVisibility:pick(row,['focusVisible']),
        accessibleName:pick(row,['accessibleName']),
        groupSemantics:pick(row,['groupSemantics']),
        statusAnnouncement:pick(row,['statusAnnouncement']),
        errorAnnouncement:pick(row,['errorAnnouncement']),
        ...(row?.emptyNotApplicable?{errorAnnouncementNotApplicable:row.emptyNotApplicable}:{}),
        wrongAnswerAnnouncement:pick(row,['wrongAnswer']),
        nonColorEquivalence:pick(row,['nonColor']),
        zoomReflow:pick(row,['reflow320','reflow375','zoom200','textScale']),
        mobileTargetSize:pick(row,['targetSize']),
        reducedMotion:pick(row,['reducedMotion']),
        screenReaderTextState:pick(row,['srTextState','headings']),
        checks:row?.checks??null,
        testEvidence:{browser:`${SPEC} → ${A11Y_EVIDENCE}`,family:FAMILY_SPECS[row?.family]??[],standaloneParity:evidence.standaloneParity.some((p:any)=>p.activityId===a.activityId)?'representative of its family in the standalone host (identical results)':'family representative covers the standalone host'},
        unresolvedIssues:row?.issues??['NO_BROWSER_EVIDENCE'],
        ...(row?.notes?.length?{notes:row.notes}:{}),
        ...(s.blockedBy.length?{blockedByContent:s.blockedBy}:{}),
      }:{notApplicableReason:a.reason}),
    };
  });
  const launchable=activities.filter((x:any)=>x.state!=='NOT_APPLICABLE');
  const count=(f:(x:any)=>boolean)=>launchable.filter(f).length;
  const families=uniq(launchable.map((x:any)=>x.family)).sort() as string[];
  const familyRows=families.map(f=>{
    const xs=launchable.filter((x:any)=>x.family===f);
    const issues:Record<string,number>={};
    for(const x of xs) for(const i of x.unresolvedIssues) issues[i]=(issues[i]??0)+1;
    return {family:f,activities:xs.length,byState:Object.fromEntries(A11Y_STATES.filter(s=>s!=='NOT_APPLICABLE').map(s=>[s,xs.filter((x:any)=>x.state===s).length])),
      failingChecks:Object.fromEntries(Object.entries(xs.reduce((m:any,x:any)=>{ for(const [k,v] of Object.entries(x.checks??{})) if(v==='FAIL') m[k]=(m[k]??0)+1; return m; },{}))),
      issues,specs:FAMILY_SPECS[f]??[]};
  });
  const unitOf=(state:string)=>uniq(launchable.filter((x:any)=>x.state===state).flatMap((x:any)=>x.learningUnits)).sort();
  const gapMap=read('reports/learning-unit-gap-map.json');
  const gapUnits=(gapMap.units??gapMap.learningUnits??[]).filter((u:any)=>(u.gaps??u.blockingGaps??[]).some((g:any)=>(g.gap??g)==='ACCESSIBILITY_UNVERIFIED')).map((u:any)=>u.learningUnitId).sort();
  const now=bundle(root); const cssBytes=fs.statSync(path.join(root,'public/app-preview/ui/tokens/kimyolab.css')).size;
  const after={...now,cssBytes};
  const verification={
    schema:'kimyolab.accessibility-verification.v1',
    semantics:'Every activity of the learning-depth baseline has an explicit accessibility state (VERIFIED / FAILED / BLOCKED / NOT_APPLICABLE), decided by ONE rule (scripts/lib/accessibility-verification.ts) from browser facts measured through the real keyboard flow. VERIFIED = AUTOMATED_VERIFIED (technical); human accessibility review is a separate field and is NOT_REVIEWED for every activity.',
    rule:{VERIFIED:'every applicable automated check PASS through the real flow (open → keyboard → empty input → wrong answer → retry → complete; reflow 320/375 px, 200 % zoom, 200 % text, 44 px targets, reduced motion)',FAILED:'any automated check FAIL, or no browser evidence',BLOCKED:'all automated checks PASS but the content lacks a label / description only a human can author (BLOCKED_BY_CONTENT)',NOT_APPLICABLE:'not launchable'},
    evidence:{browser:A11Y_EVIDENCE,spec:SPEC,reMeasured:'on every npm run verify (e2e gate): any difference from the committed facts fails the build'},
    totals:{activities:activities.length,launchable:launchable.length,byState:Object.fromEntries(A11Y_STATES.map(s=>[s,activities.filter((x:any)=>x.state===s).length])),automatedVerified:count((x:any)=>x.state==='VERIFIED'),humanReviewed:0},
    activities,
  };
  const summary={
    schema:'kimyolab.accessibility-gap-summary.v1',
    semantics:'Accessibility debt reported separately from learning depth, assessment, governance and release (it is not an input of any progress formula). Automated technical verification and human accessibility review are distinct; the human-review count is factual.',
    totals:{
      activities:activities.length,launchable:launchable.length,notApplicable:activities.length-launchable.length,
      automatedVerified:count((x:any)=>x.state==='VERIFIED'),failed:count((x:any)=>x.state==='FAILED'),blocked:count((x:any)=>x.state==='BLOCKED'),
      humanReviewed:0,
      keyboardPass:count((x:any)=>x.keyboardOperability==='PASS'),
      screenReaderSemanticsPass:count((x:any)=>['accessibleName','groupSemantics','statusAnnouncement','screenReaderTextState'].every(k=>x[k]!=='FAIL'&&x[k]!=='NO_EVIDENCE')),
      nonColorPass:count((x:any)=>x.nonColorEquivalence==='PASS'),
      mobileReflowPass:count((x:any)=>x.zoomReflow==='PASS'&&x.mobileTargetSize==='PASS'),
      reducedMotionPass:count((x:any)=>x.reducedMotion==='PASS'),
      focusVisiblePass:count((x:any)=>x.focusVisibility==='PASS'),
      errorAnnouncementPass:count((x:any)=>x.errorAnnouncement==='PASS'),errorAnnouncementNotApplicable:count((x:any)=>x.errorAnnouncement==='NOT_APPLICABLE'),
    },
    beforeFixes:BEFORE_SWEEP,
    before:{...BEFORE,note:'P2.6 close: only the 7 registry renderers carried a DECLARED accessibility contract; the 138 legacy activities were UNKNOWN. P2.7 replaces declarations with browser measurement for all 145.'},
    families:familyRows,
    affectedLearningUnits:{failed:unitOf('FAILED'),blocked:unitOf('BLOCKED'),withAccessibilityGap:gapUnits,withAccessibilityGapCount:gapUnits.length},
    standaloneParity:{representatives:evidence.standaloneParity.length,identical:evidence.standaloneParity.filter((p:any)=>p.identical).length,activities:evidence.standaloneParity.map((p:any)=>({activityId:p.activityId,family:p.family,identical:p.identical}))},
    notApplicable:evidence.notLaunchable,
    // facts that apply to EVERY learner equally (not accessibility inequivalence) — reported, never counted as a pass
    feedbackObservations:Object.fromEntries(['ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE','STEP_ORDER_NOT_ENFORCED_BY_ENGINE'].map(code=>{ const ids=launchable.filter((x:any)=>(x.notes??[]).some((n:string)=>n.startsWith(code))).map((x:any)=>x.activityId); return [code,{activities:ids.length,activityIds:ids,meaning:code.startsWith('ENGINE')?'a non-target value is recorded without a verdict (VALID_INTERMEDIATE, P2.9): the config declares no incorrect state, so no wrong answer exists to announce, for any learner — human decision pending (reports/learner-feedback-semantics.json)':'the engine accepts the steps in any order (no order is declared): an out-of-order step is not a wrong answer — human decision pending (reports/learner-feedback-semantics.json)'}]; })),
    performance:{method:'raw bytes of the committed learner modules (public/app-preview/**/*.js), the shared stylesheet and the standalone artifact',before:BUNDLE_BEFORE,after,
      delta:{learnerModules:after.learnerModules-BUNDLE_BEFORE.learnerModules,learnerModuleBytes:after.learnerModuleBytes-BUNDLE_BEFORE.learnerModuleBytes,cssBytes:after.cssBytes-BUNDLE_BEFORE.cssBytes,standaloneBytes:after.standaloneBytes-BUNDLE_BEFORE.standaloneBytes},
      dependencies:'none added at runtime; the accessibility harness (tests/helpers/a11y*.mjs) is test-only and dependency-free (Playwright was already a dev dependency)'},
    notInScope:['no human accessibility approval is created or implied','no progress weight or formula changed — accessibility is reported here, separately','no chemistry, label translation or colour description was authored: missing ones are BLOCKED_BY_CONTENT'],
  };
  return {verification,summary};
}

if(import.meta.url===`file://${process.argv[1]}`||process.argv[1]?.endsWith('accessibility-verification.ts')){
  const {verification,summary}=buildAccessibilityReports();
  fs.writeFileSync(path.join(root,'reports/accessibility-verification.json'),JSON.stringify(verification,null,2)+'\n');
  fs.writeFileSync(path.join(root,'reports/accessibility-gap-summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({accessibility:summary.totals,families:summary.families.map(f=>({family:f.family,...f.byState}))}));
}
