// learning:depth (P2.0) — writes the learning-depth baseline and everything derived from it:
//   reports/learning-depth-baseline.json · learning-depth-summary.json · learning-unit-gap-map.json ·
//   project-progress.json · p2-work-packages.json
// Measurement only (no content, chemistry, answer, mapping, renderer, mastery or release change). Deterministic.
// Every formula is in docs/roadmap/PROGRESS_MODEL.md and repeated inside the reports (`formula` fields).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLearningDepth,level,pct,uniq} from './lib/learning-depth.ts';
import {loadSources} from './learning-readiness.ts';
import {compileReadiness} from './lib/readiness-compile.ts';
import {buildKbReports} from './lib/chemistry-kb.ts';
import {deriveAuthoringTasks} from './lib/authoring.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const DEPTH_REPORTS={baseline:'reports/learning-depth-baseline.json',summary:'reports/learning-depth-summary.json',gapMap:'reports/learning-unit-gap-map.json',progress:'reports/project-progress.json',workPackages:'reports/p2-work-packages.json'};
/** Published weights (docs/roadmap/PROGRESS_MODEL.md). Changing one is a reviewed change to this file AND the doc. */
/** The technical milestones in order, with their names. A milestone is DELIVERED when its kill-critic review exists
 *  in docs/reviews/; the latest delivered one is the CURRENT stage (the stage this report describes), every earlier one
 *  is COMPLETED, and the NEXT technical milestone is the first roadmap entry after the current one. */
export const ROADMAP:ReadonlyArray<{id:string;label:string}>=[
  {id:'P2.0',label:'learning depth & coverage baseline'},
  {id:'P2.1',label:'learner interaction reliability & usability'},
  {id:'P2.2',label:'portal-safe host foundation'},
  {id:'P2.3',label:'structured theory system'},
  {id:'P2.4',label:'governed theory authoring & source operations'},
  {id:'P2.5',label:'model-based reaction interaction expansion'},
  {id:'P2.6',label:'computed model interaction expansion'},
  {id:'P2.7',label:'accessibility verification & legacy interaction hardening'},
  {id:'P2.8',label:'installation readiness & CI reproducibility'},
  {id:'P2.9',label:'learner feedback semantics & flow integrity'},
  {id:'P2.10',label:'guided dynamic lab inventory & architecture'},
  {id:'P2.11',label:'instruction-driven runtime expansion & capability registry'},
  {id:'P2.12',label:'Content Studio MVP & canonical authoring pipeline'},
  {id:'P2.13',label:'periodic table & Element Knowledge Hub'},
  {id:'P2.14',label:'Substance Passport & Reaction Explorer'},
  {id:'P2.15+',label:'assessment / localization / governance expansion'},
  {id:'P3',label:'real portal deployment and production pilot'},
];
const milestoneOrder=(a:string,b:string)=>a.localeCompare(b,undefined,{numeric:true});
export function milestoneState(base:string){
  const delivered=fs.readdirSync(path.join(base,'docs/reviews')).filter(f=>/-kill-critic\.md$/.test(f)).map(f=>f.replace('-kill-critic.md','').toUpperCase()).sort(milestoneOrder);
  const current=delivered.at(-1)!;
  const label=(id:string)=>ROADMAP.find(r=>r.id===id)?.label;
  const next=ROADMAP.filter(r=>milestoneOrder(r.id,current)>0).slice(0,1).map(r=>`${r.id} — ${r.label}`);
  return {completed:['P0-INTEGRITY',...delivered.slice(0,-1)],current,currentLabel:label(current)?`${current} — ${label(current)}`:current,next};
}

export const WEIGHTS={learningProduct:{learningCoverage:1/6,modelBasedInteraction:1/6,assessmentCoverage:1/6,governance:1/6,release:1/6,localization:1/6},overall:{foundation:0.4,learningProduct:0.6}};
const round=(x:number)=>Math.round(x*1000)/1000;

export async function buildDepthReports(base=root){
  const d=await buildLearningDepth(base);
  const U=d.units, A=d.activities, n=U.length;
  const count=(xs:any[],f:(x:any)=>string)=>{ const o:Record<string,number>={}; for(const x of xs){ const k=f(x); o[k]=(o[k]??0)+1; } return Object.fromEntries(Object.entries(o).sort()); };
  const dims=['theory','practice','assessment','mastery','interaction','governance'] as const;
  const src=loadSources(base);
  const {fatal}=compileReadiness(src);
  const kb=buildKbReports(base);
  const tasks=deriveAuthoringTasks(base);
  const items=U.reduce((s,u)=>s+u.assessment.items,0), approvedItems=U.reduce((s,u)=>s+u.assessment.approved,0);
  const outcomesTotal=U.reduce((s,u)=>s+u.outcomeIds.length,0);
  const outcomesCovered=U.reduce((s,u)=>s+u.assessment.outcomesCovered,0), outcomesCoveredApproved=U.reduce((s,u)=>s+u.assessment.outcomesCoveredApproved,0);
  const modelLUs=U.filter(u=>u.practiceActivities.some((p:any)=>p.depth==='MODEL_BASED'&&p.canSucceed==='CAN_SUCCEED'));

  // ------------------------------------------------ baseline
  const baseline={
    schema:'kimyolab.learning-depth-baseline.v1',
    semantics:'Measurement only. runtime READY ≠ pedagogical depth; theory present ≠ mastery; item count ≠ outcome coverage; provenance debt ≠ missing learning content. Classification rules: scripts/lib/learning-depth.ts, docs/roadmap/PROGRESS_MODEL.md.',
    counts:{learningUnits:n,activities:A.length},
    enums:{theory:['NONE','MINIMAL','STRUCTURED'],practice:['NONE','STATIC_CHECK','GUIDED','MODEL_BASED'],assessment:['NONE','DRAFT','REVIEW_PENDING','APPROVED'],mastery:['UNREACHABLE','PARTIAL','REACHABLE'],interaction:['NONE','FORM','SCRIPTED','MODEL_INTERACTIVE'],governance:['UNREVIEWED','REVIEW_PENDING','APPROVED','RELEASED']},
    learningUnits:U,
    activities:A,
    engines:d.engines,
    renderers:d.renderer,
    labs:d.labs,
    accessibility:d.accessibility,
    localization:d.localization,
  };

  // ------------------------------------------------ summary
  const share=(f:(u:any)=>boolean)=>({count:U.filter(f).length,percent:pct(U.filter(f).length,n)});
  const releaseStatus=JSON.parse(fs.readFileSync(path.join(base,'reports/release-decision-status.json'),'utf8'));
  const summary={
    schema:'kimyolab.learning-depth-summary.v1',
    totalLearningUnits:n,totalActivities:A.length,
    theoryCoverage:{present:share(u=>u.dimensions.theory!=='NONE'),structured:share(u=>u.dimensions.theory==='STRUCTURED'),byDepth:count(U,u=>u.dimensions.theory),note:'every theory has a one-line concept summary + a legacy mapping note; no worked example, misconception or summary block exists yet'},
    practiceCoverage:{atLeastStaticCheck:share(u=>u.dimensions.practice!=='NONE'),atLeastGuided:share(u=>['GUIDED','MODEL_BASED'].includes(u.dimensions.practice)),byDepth:count(U,u=>u.dimensions.practice),activitiesByDepth:count(A,x=>x.depth),activitiesByInteraction:count(A,x=>x.interaction)},
    modelBasedCoverage:{activities:A.filter(x=>x.depth==='MODEL_BASED').length,learningUnits:modelLUs.length,percentOfLearningUnits:pct(modelLUs.length,n)},
    assessmentCoverage:{totalItems:items,approvedItems,learningUnitsWithItems:U.filter(u=>u.assessment.items>0).length,learningUnitsWithApprovedAssessment:U.filter(u=>u.assessment.depth==='APPROVED').length,outcomes:outcomesTotal,outcomesCovered,outcomesCoveredByApprovedItems:outcomesCoveredApproved,outcomeCoveragePercent:pct(outcomesCovered,outcomesTotal),note:'5 draft items in one unit (lu.9.15), 0 approved: the production assessment is a pilot baseline, not coverage'},
    masteryReachable:{count:U.filter(u=>u.masteryReachable).length,percent:pct(U.filter(u=>u.masteryReachable).length,n),byDepth:count(U,u=>u.dimensions.mastery),blockReasons:count(U.flatMap(u=>u.mastery.blockReasons.map((r:string)=>({r}))),x=>x.r)},
    released:{humanReleasedActivities:releaseStatus.totals.released,runtimeAvailableActivities:A.filter(x=>x.runtimeReadiness==='READY').length,note:'runtime availability comes from grandfathered authored lifecycle; a human RELEASE decision exists for 0 activities'},
    canSucceed:count(A,x=>x.canSucceed),
    dimensions:Object.fromEntries(dims.map(k=>[k,count(U,u=>u.dimensions[k])])),
  };

  // ------------------------------------------------ gap map
  const gapCategory:Record<string,string>={THEORY_MINIMAL:'LEARNING_CONTENT',NO_GUIDED_OR_MODEL_PRACTICE:'LEARNING_DEPTH',NO_MODEL_BASED_PRACTICE:'LEARNING_DEPTH',NO_ASSESSMENT:'LEARNING_CONTENT',ASSESSMENT_NOT_APPROVED:'GOVERNANCE',MASTERY_UNREACHABLE:'LEARNING_OUTCOME',PRACTICE_INCOMPLETE:'LEARNING_DEPTH',UNREVIEWED:'GOVERNANCE',NOT_RELEASED:'GOVERNANCE',PROVENANCE_DEBT:'PROVENANCE',UNTRANSLATED_ANSWER_TOKEN:'LOCALIZATION',RAW_ID_LABELS:'LOCALIZATION',ACCESSIBILITY_UNVERIFIED:'ACCESSIBILITY'};
  const byAct=new Map(A.map(x=>[x.activityId,x]));
  const gapRows=U.map(u=>{
    const layers:Record<string,number>=Object.fromEntries(dims.map(k=>[k,round(level(k,u.dimensions[k]))]));
    const sorted=[...dims].sort((a,b)=>((layers[b]??0)-(layers[a]??0))||a.localeCompare(b));
    const acts=u.practiceActivities.map((p:any)=>byAct.get(p.activityId)).filter(Boolean);
    const gaps:string[]=[];
    if(u.dimensions.theory!=='STRUCTURED') gaps.push('THEORY_MINIMAL');
    if(!['GUIDED','MODEL_BASED'].includes(u.dimensions.practice)) gaps.push('NO_GUIDED_OR_MODEL_PRACTICE');
    else if(u.dimensions.practice!=='MODEL_BASED') gaps.push('NO_MODEL_BASED_PRACTICE');
    if(u.dimensions.practice==='NONE') gaps.push('PRACTICE_INCOMPLETE');
    if(u.assessment.depth==='NONE') gaps.push('NO_ASSESSMENT'); else if(u.assessment.depth!=='APPROVED') gaps.push('ASSESSMENT_NOT_APPROVED');
    if(!u.masteryReachable) gaps.push('MASTERY_UNREACHABLE');
    if(u.dimensions.governance==='UNREVIEWED') gaps.push('UNREVIEWED');
    if(u.releaseState.primary!=='RELEASED') gaps.push('NOT_RELEASED');
    if(u.provenanceDebt.assertionsWithoutAcceptableSource) gaps.push('PROVENANCE_DEBT');
    if(acts.some((x:any)=>x.expectsUntranslatedToken)) gaps.push('UNTRANSLATED_ANSWER_TOKEN');
    if(acts.some((x:any)=>x.localization?.rawIdLabels?.length)) gaps.push('RAW_ID_LABELS');
    // P2.7: removed only where the browser sweep verified EVERY launchable activity of the unit (no blanket clearing)
    if(acts.some((x:any)=>x.accessibility&&x.accessibility.state!=='VERIFIED')) gaps.push('ACCESSIBILITY_UNVERIFIED');
    const modules=uniq(acts.flatMap((x:any)=>x.modules??[]));
    const reuse=d.renderer.nextCandidates.find((c:any)=>c.rendererReuse&&c.affectedLearningUnits.includes(u.learningUnitId));
    const exposable=d.renderer.nextCandidates.find((c:any)=>c.existingDomainModel&&c.realLearnerChoicePossible&&c.affectedLearningUnits.includes(u.learningUnitId)&&!c.knownBlocker);
    const nextTechnical=u.dimensions.practice==='MODEL_BASED'?'extend the existing model-based renderer (more modeled records reviewed by a chemist)'
      :reuse?`reuse renderer ${reuse.rendererReuse} for ${reuse.affectedActivities.filter((a:string)=>u.practiceActivities.some((p:any)=>p.activityId===a)).join(', ')}`
      :exposable?`expose domain model ${exposable.module} through a model-based renderer (black-swan must hold)`
      :modules.length?`domain model ${modules.join(', ')} exists but is blocked (${d.renderer.nextCandidates.find((c:any)=>modules.includes(c.module))?.knownBlocker??'see candidate map'})`
      :acts.some((x:any)=>x.localization?.rawIdLabels?.length||x.expectsUntranslatedToken)?'replace raw-id labels / untranslated answer tokens in the legacy form UI':'no domain model yet — authoring a model precedes any renderer';
    const nextHuman=u.assessment.depth==='NONE'?'author assessment items for this unit, then chemistry + didactic review (two people)'
      :u.assessment.depth!=='APPROVED'?'chemistry + didactic review of the unit’s assessment items':
      u.governance.activityReview!=='APPROVED'?'content review (technical, didactic, accessibility) of the primary activity':'content-owner release decision';
    return {learningUnitId:u.learningUnitId,grade:u.grade,topic:u.topic,layers,strongestLayer:sorted[0],weakestLayer:sorted[sorted.length-1],
      blockingGaps:gaps.map(g=>({gap:g,category:gapCategory[g]})),nextTechnicalOpportunity:nextTechnical,nextHumanDependency:nextHuman};
  });
  const gapCounts=count(gapRows.flatMap(r=>r.blockingGaps),g=>g.gap);
  const gapMap={
    schema:'kimyolab.learning-unit-gap-map.v1',
    semantics:'Per unit: normalized layer levels (0..1), strongest/weakest layer, blocking gaps with their CATEGORY (learning content / depth / outcome vs governance vs provenance vs localization vs accessibility — never merged), one technical opportunity and one human dependency. Ties broken alphabetically. No priority score.',
    gapCounts,gapCountsByCategory:count(gapRows.flatMap(r=>r.blockingGaps),g=>g.category),
    units:gapRows,
  };

  // ------------------------------------------------ progress
  const exists=(rel:string)=>fs.existsSync(path.join(base,rel));
  const launchable=A.filter(x=>x.canSucceed!=='NOT_LAUNCHABLE');
  const foundationChecks=[
    {id:'canonical-routing',pass:A.filter(x=>x.runtime===null).length<=1,detail:`${A.filter(x=>x.runtime===null).length} unrouted activity (practice.simulation.10.4, DISABLED by design)`},
    {id:'readiness-compiles',pass:fatal.length===0,detail:`${fatal.length} fatal readiness issue(s)`},
    {id:'renderer-registry',pass:d.renderer.modelBasedRenderers.length>=1,detail:`${d.renderer.modelBasedRenderers.length} registry capabilities`},
    {id:'chemistry-kb-gate',pass:kb.gate.status!=='FAIL',detail:`KB gate ${kb.gate.status}`},
    {id:'pilot-gate',pass:JSON.parse(fs.readFileSync(path.join(base,'reports/pilot-acceptance-matrix.json'),'utf8')).gate!=='FAIL',detail:'pilot:status not FAIL'},
    {id:'review-workbench',pass:exists('review-packets/reviewer-workspace.html'),detail:'one offline human review workbench'},
    {id:'authoring-pipeline',pass:exists('scripts/authoring.ts'),detail:'governed authoring (draft/preview/human apply)'},
    {id:'release-authority',pass:exists('content-src/release-decisions.json')&&/effectiveRelease/.test(fs.readFileSync(path.join(base,'scripts/lib/readiness-compile.ts'),'utf8')),detail:'release register → build-time effective lifecycle (single authority)'},
    {id:'learner-can-succeed',pass:launchable.every(x=>x.canSucceed==='CAN_SUCCEED'),detail:`${launchable.filter(x=>x.canSucceed==='CAN_SUCCEED').length}/${launchable.length} launchable activities can be completed through the real UI path`},
    {id:'no-crash-on-wrong-input',pass:!A.some(x=>String(x.wrongInput).startsWith('THROWS')),detail:`${A.filter(x=>String(x.wrongInput).startsWith('THROWS')).length} activity crashes on an unexpected answer`},
  ];
  const foundation=foundationChecks.filter(c=>c.pass).length/foundationChecks.length;
  const comp={
    learningCoverage:U.reduce((s,u)=>s+(level('theory',u.dimensions.theory)+level('practice',u.dimensions.practice)+level('assessment',u.dimensions.assessment))/3,0)/n,
    modelBasedInteraction:modelLUs.length/n,
    assessmentCoverage:U.filter(u=>u.assessment.depth==='APPROVED').length/n,
    governance:(d.chemistry.approved+approvedItems+A.filter(x=>x.content==='APPROVED').length)/(d.chemistry.assertions+items+A.length),
    release:releaseStatus.totals.released/A.length,
    localization:['uz-Latn','uz-Cyrl','ru'].reduce((s,l)=>s+(d.localization.learningUnitTitles[l]??0)/n,0)/3,
  };
  const learningProduct=Object.entries(WEIGHTS.learningProduct).reduce((s,[k,w])=>s+w*(comp as any)[k],0);
  const overall=WEIGHTS.overall.foundation*foundation+WEIGHTS.overall.learningProduct*learningProduct;
  const ms=milestoneState(base);
  const P=(x:number)=>round(x*100);
  const progress={
    schema:'kimyolab.project-progress.v1',
    semantics:'Computed from the repository by scripts/learning-depth.ts. Every percentage has its formula (docs/roadmap/PROGRESS_MODEL.md). Not a marketing number.',
    foundationProgress:{percent:P(foundation),formula:'passed foundation checks / all foundation checks',checks:foundationChecks},
    learningProductProgress:{percent:P(learningProduct),formula:'Σ weight × component (equal weights 1/6)',weights:WEIGHTS.learningProduct,components:Object.fromEntries(Object.entries(comp).map(([k,v])=>[k,P(v)]))},
    overallManagementEstimate:{percent:P(overall),formula:'0.4 × foundationProgress + 0.6 × learningProductProgress',weights:WEIGHTS.overall,note:'a management composite; read the two progress numbers above first'},
    dimensions:{
      foundation:{percent:P(foundation),formula:'foundation checks'},
      learningCoverage:{percent:P(comp.learningCoverage),formula:'mean over units of (theory + practice + assessment levels)/3, levels normalized 0..1'},
      modelBasedInteraction:{percent:P(comp.modelBasedInteraction),formula:'units with ≥1 MODEL_BASED activity the learner can complete / 122'},
      assessmentCoverage:{percent:P(comp.assessmentCoverage),formula:'units with an APPROVED (available) assessment / 122'},
      governance:{percent:P(comp.governance),formula:'(approved chemistry assertions + approved assessment items + content-approved activities) / (all of them)'},
      release:{percent:P(comp.release),formula:'activities with a current human RELEASE decision / 146'},
      localization:{percent:P(comp.localization),formula:'mean over target locales (uz-Latn, uz-Cyrl, ru) of localized unit content / 122'},
    },
    whereWeStarted:{label:'P0: legacy KimyoLab content migrated into a validated content pack; no canonical runtime, readiness, review or release governance',milestone:'P0-INTEGRITY'},
    whereWeAreNow:{milestone:ms.current,foundationPercent:P(foundation),learningProductPercent:P(learningProduct),facts:[`${n} units, ${A.length} activities`,`${summary.practiceCoverage.activitiesByDepth.MODEL_BASED??0} model-based activities in ${modelLUs.length} units`,`${items} assessment items (0 approved) in ${summary.assessmentCoverage.learningUnitsWithItems} unit`,`0 human approvals, 0 human releases, 0 pilot sign-offs`,`theory: ${summary.theoryCoverage.structured.count} structured / ${n}`]},
    completedMilestones:ms.completed,
    currentMilestone:ms.currentLabel,
    nextMilestones:[...ms.next,'human review round (workbench): chemistry A–C queues, lu.9.15 assessment','release decisions for the 27 pending activities'],
    // P2.2: deployment/portal readiness is a SEPARATE metric (reports/portal-subpath-readiness.json). It is reported here
    // for visibility and is NOT an input of foundation, learning product or the 0.4/0.6 overall estimate (ADR-P2-003 §8).
    separateMetrics:(()=>{ const f=path.join(base,'reports/portal-subpath-readiness.json'); if(!fs.existsSync(f)) return {portalSubpathReadiness:null}; const r=JSON.parse(fs.readFileSync(f,'utf8')); return {portalSubpathReadiness:{source:'reports/portal-subpath-readiness.json',status:r.summary.status,checksPassed:r.summary.pass,checks:r.summary.checks,portalIntegrated:r.portalIntegrated,inManagementFormula:false}}; })(),
    remainingMajorWork:['assessment for 121 units (and review of lu.9.15)','structured theory for 122 units','model-based practice beyond 6 units','source provenance for 127 assertions','uz-Cyrl and ru localization',`accessibility: ${A.filter(x=>x.accessibility&&x.accessibility.state!=='VERIFIED').length} launchable activities not automatically verified; human accessibility review of all of them`,'human review and release decisions'],
    uzSummary:[
      `Platforma poydevori: ${P(foundation)}% (${foundationChecks.filter(c=>c.pass).length}/${foundationChecks.length} tekshiruv o‘tdi).`,
      `O‘quv mahsuloti: ${P(learningProduct)}%. ${n} ta mavzudan ${modelLUs.length} tasida model asosidagi amaliyot bor, ${summary.assessmentCoverage.learningUnitsWithApprovedAssessment} tasida tasdiqlangan test bor.`,
      `Nazariya: ${n} ta mavzuning hammasida faqat qisqa xulosa bor (misol, xato tushunchalar va yakun yo‘q).`,
      `Inson qarorlari: 0 approval, 0 release, 0 pilot sign-off.`,
    ],
  };

  // ------------------------------------------------ work packages
  const luOf=(ids:string[])=>uniq(A.filter(x=>ids.includes(x.activityId)).flatMap(x=>x.learningUnits)).sort();
  const legacyUnknownA11y=A.filter(x=>x.accessibility&&x.accessibility.state!=='VERIFIED').map(x=>x.activityId);
  const rawIds=A.filter(x=>x.localization?.rawIdLabels?.length||x.expectsUntranslatedToken).map(x=>x.activityId);
  const staticLabs=d.labs.rows.filter((r:any)=>r.class==='static').map((r:any)=>r.activityId);
  const crash=A.filter(x=>String(x.wrongInput).startsWith('THROWS')).map(x=>x.activityId);
  const packages=[
    {id:'wp.assessment-expansion',category:'assessment expansion',affectedLearningUnits:U.filter(u=>u.assessment.depth!=='APPROVED').map(u=>u.learningUnitId),affectedActivities:[],
      facts:{unitsWithoutItems:U.filter(u=>u.assessment.depth==='NONE').length,draftItems:items,approvedItems,outcomesUncovered:outcomesTotal-outcomesCovered},
      dependencies:['outcome mapping review (q.9.15.01/.02/.04 flagged)','assessment item provenance'],machineWork:['item schema and packet generation already exist; per-unit item validation'],humanWork:['author items per unit','chemistry + didactic review by two people'],blockers:['no authored items for 121 units']},
    ...d.renderer.nextCandidates.filter((c:any)=>c.existingDomainModel).map((c:any)=>({id:`wp.model-renderer.${c.module}`,category:c.rendererReuse?'model-based renderer (reuse)':'model-based renderer',affectedLearningUnits:c.affectedLearningUnits,affectedActivities:c.affectedActivities,
      facts:{modelRecords:c.modelRecords,realLearnerChoicePossible:c.realLearnerChoicePossible,currentBrowserLimitation:c.currentBrowserLimitation,rendererReuse:c.rendererReuse},
      dependencies:[c.module==='organic-knowledge'?'organic KB review':'chemistry review of the model records'],machineWork:['renderer model + intents, black-swan probes, keyboard/a11y E2E'],humanWork:['chemistry review of model data','content review of the activities'],blockers:c.knownBlocker?[c.knownBlocker]:[]})),
    {id:'wp.engine-exposure',category:'engine exposure',affectedLearningUnits:[],affectedActivities:[],facts:{unusedModules:d.engines.filter((e:any)=>e.status==='UNUSED').map((e:any)=>e.module),formOnlyModules:d.engines.filter((e:any)=>e.status==='FORM_OR_SCRIPT_ONLY').map((e:any)=>e.module)},dependencies:[],machineWork:['connect unused/form-only models to a learner-facing interaction'],humanWork:['decide which curriculum units need them'],blockers:[]},
    {id:'wp.lab-repair',category:'lab repair',affectedLearningUnits:luOf([...staticLabs,...crash]),affectedActivities:[...staticLabs,...crash],facts:{proceduralLabsWithoutDomainState:staticLabs.length,crashOnWrongInput:crash,cannotSucceed:d.labs.cannotSucceed},dependencies:['reaction/model grounding of lab steps (P1 guided-lab hardening pattern)'],machineWork:['ground procedural steps in the reaction KB / models','fail-closed feedback instead of an exception on unexpected input'],humanWork:['chemistry review of grounded steps'],blockers:[]},
    {id:'wp.theory-enrichment',category:'theory enrichment',affectedLearningUnits:U.filter(u=>u.dimensions.theory!=='STRUCTURED').map(u=>u.learningUnitId),affectedActivities:[],facts:{minimal:U.filter(u=>u.dimensions.theory==='MINIMAL').length,withWorkedExample:U.filter(u=>u.theory.checks.workedExample).length,withMisconception:U.filter(u=>u.theory.checks.misconception).length},dependencies:['theory block schema (worked example, misconception, summary)'],machineWork:['theory block schema + validation'],humanWork:['author explanations, worked examples, misconceptions, summaries','didactic review'],blockers:[]},
    {id:'wp.accessibility',category:'accessibility',affectedLearningUnits:luOf(legacyUnknownA11y),affectedActivities:legacyUnknownA11y,facts:{automatedVerified:A.filter(x=>x.accessibility?.state==='VERIFIED').length,notVerified:legacyUnknownA11y.length,byState:d.accessibility.states,humanReviewed:0},dependencies:[],machineWork:['fix the FAILED families listed in reports/accessibility-gap-summary.json'],humanWork:['accessibility review (screen reader + keyboard) by a person','content labels / colour descriptions for BLOCKED_BY_CONTENT activities'],blockers:[]},
    {id:'wp.localization',category:'localization',affectedLearningUnits:luOf(rawIds),affectedActivities:rawIds,facts:{targets:['uz-Latn','uz-Cyrl','ru'],contentLocales:['uz-Latn'],rawIdLabelActivities:d.localization.rawIdLabels.activities,untranslatedAnswerTokenActivities:d.localization.untranslatedAnswerTokens.activities,hardcodedUzbekUiLiterals:d.localization.hardcodedUzbekUi.literals},dependencies:['locale architecture decision (content packs per locale)'],machineWork:['P2.1 done: label catalog, choice UI for closed domains, shared UI string catalog','choice UI for the remaining token fields once option sets exist'],humanWork:['author option sets for the OPTION_SET_MISSING fields (reports/learner-answer-input-audit.json)','review the uz-Latn learner-interaction catalog','uz-Cyrl and ru translation','terminology review'],blockers:d.localization.untranslatedAnswerTokens.activities?['OPTION_SET_MISSING: only the target token exists in the repository']:[]},
    {id:'wp.human-review',category:'human review',affectedLearningUnits:U.map(u=>u.learningUnitId),affectedActivities:A.map(x=>x.activityId),facts:{chemistryAssertionsPending:d.chemistry.assertions-d.chemistry.approved,assessmentItemsPending:items-approvedItems,activitiesContentPending:A.filter(x=>x.content!=='APPROVED').length,releaseDecisionsMissing:releaseStatus.totals.decisionMissing,pilotSignoffsPending:4},dependencies:['provenance (approvals without an acceptable source do not count)'],machineWork:[],humanWork:['workbench review rounds','release decisions','pilot sign-offs'],blockers:['0 human decisions so far']},
    {id:'wp.provenance',category:'provenance',affectedLearningUnits:U.filter(u=>u.provenanceDebt.assertionsWithoutAcceptableSource>0).map(u=>u.learningUnitId),affectedActivities:[],facts:{assertionsWithoutAcceptableSource:d.chemistry.provenanceDebt,addSourceTasks:tasks.filter(t=>t.action==='add-source').length,note:'PROVENANCE DEBT — sources to register and cite; the learning content exists'},dependencies:['source registry reclassification with evidence (reviewed PR)'],machineWork:[],humanWork:['register textbooks/standards/glossary','cite them via add-source drafts'],blockers:[]},
  ];
  const workPackages={
    schema:'kimyolab.p2-work-packages.v1',
    semantics:'Work packages derived from the baseline. Each lists impact facts, coverage, dependencies, blockers, machine work and human work. There is NO priority score: the order below is by category name, and prioritization is a human decision in the next task.',
    counts:{packages:packages.length,byCategory:count(packages,p=>p.category)},
    packages:packages.sort((a,b)=>a.category.localeCompare(b.category)||a.id.localeCompare(b.id)),
  };
  return {baseline,summary,gapMap,progress,workPackages};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=await buildDepthReports(root);
  const write=(rel:string,body:unknown)=>fs.writeFileSync(path.join(root,rel),`${JSON.stringify(body,null,2)}\n`,'utf8');
  write(DEPTH_REPORTS.baseline,r.baseline); write(DEPTH_REPORTS.summary,r.summary); write(DEPTH_REPORTS.gapMap,r.gapMap); write(DEPTH_REPORTS.progress,r.progress); write(DEPTH_REPORTS.workPackages,r.workPackages);
  console.log(JSON.stringify({units:r.summary.totalLearningUnits,activities:r.summary.totalActivities,foundation:r.progress.foundationProgress.percent,learningProduct:r.progress.learningProductProgress.percent,overall:r.progress.overallManagementEstimate.percent,modelBasedUnits:r.summary.modelBasedCoverage.learningUnits,masteryReachable:r.summary.masteryReachable.count}));
}
