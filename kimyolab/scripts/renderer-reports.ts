// renderer:reports (P1.4 §37–39) — deterministic reports about the RendererRegistry:
//   reports/renderer-registry.json        registered capabilities, versions, schemas, accessibility, activities
//   reports/renderer-migration.json       registry-rendered vs legacy vs blocked, future candidates
//   reports/reference-renderer-atom.json  the atom-builder reference renderer: model-based proof, parity, a11y
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSources} from './learning-readiness.ts';
import {compileReadiness} from './lib/readiness-compile.ts';
import {CONFIG_SOURCE_NAMES,deriveActivityExecutionPlan} from '../src/runtime/practice-router/execution-plan.ts';
import {satisfiesVersionRange} from '../src/runtime/compatibility/version-range.ts';
import {RENDERER_CATALOG} from '../src/renderers/catalog.ts';
import {createDefaultRendererRegistry} from '../src/renderers/index.ts';
import {atomIntent} from '../src/renderers/atom-builder/renderer.ts';
import {toAtomRendererModel,ATOM_RENDERER_MODEL_SCHEMA} from '../src/renderers/atom-builder/renderer-model.ts';
import {deriveAtomState} from '../src/domain/chemistry/atom.ts';
import {runAtomParity} from '../tests/helpers/atom-parity.mjs';
import {elementNameMapper,parseElementNameCatalog} from '../src/features/localization/element-names.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {hydrolysisIntent} from '../src/renderers/hydrolysis-medium/renderer.ts';
import {toHydrolysisRendererModel,HYDROLYSIS_RENDERER_MODEL_SCHEMA} from '../src/renderers/hydrolysis-medium/renderer-model.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {diskFetch} from './pilot-status.ts';
import {ionicIntent} from '../src/renderers/ionic-precipitation/renderer.ts';
import {toIonicPrecipitationRendererModel,IONIC_RENDERER_MODEL_SCHEMA} from '../src/renderers/ionic-precipitation/renderer-model.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {conditionIntent} from '../src/renderers/condition-prediction/renderer.ts';
import {toConditionRendererModel,CONDITION_RENDERER_MODEL_SCHEMA} from '../src/renderers/condition-prediction/renderer-model.ts';
import {createLocalizer,parseInteractionCatalog} from '../src/features/localization/element-names.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const REGISTRY_REPORT='reports/renderer-registry.json';
export const MIGRATION_REPORT='reports/renderer-migration.json';
export const ATOM_REPORT='reports/reference-renderer-atom.json';
export const HYDROLYSIS_REPORT='reports/reference-renderer-hydrolysis.json';
export const IONIC_REPORT='reports/reference-renderer-ionic-precipitation.json';
export const CONDITION_REPORT='reports/reference-renderer-condition-prediction.json';
/** Where each registered capability is implemented (checked to exist). */
const IMPLEMENTATIONS:Record<string,string>={'atom-builder':'src/renderers/atom-builder/renderer.ts','hydrolysis-medium':'src/renderers/hydrolysis-medium/renderer.ts','ionic-precipitation':'src/renderers/ionic-precipitation/renderer.ts','condition-prediction':'src/renderers/condition-prediction/renderer.ts'};

function plans(base:string){
  const src=loadSources(base);
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,src.configs[n]??{}]));
  const {pack}=compileReadiness(src);
  return {src,pack,rows:src.activities.map((a:any)=>({activity:a,route:deriveActivityExecutionPlan(a,configs),readiness:pack.activities.find(r=>r.activityId===a.id)!}))};
}

export function buildRegistryReport(base=root){
  const registry=createDefaultRendererRegistry();
  const {rows}=plans(base);
  const capabilities=registry.capabilities();
  return {
    schema:'kimyolab.renderer-registry.v1',
    semantics:'Resolution key = capability id + compatible version (semver range). Activity ids never select a renderer. Accessibility is a registration gate.',
    catalogMatchesRegistry:JSON.stringify(RENDERER_CATALOG.map(c=>[c.id,c.version])) ===JSON.stringify(capabilities.map(c=>[c.id,c.version])),
    renderers:capabilities.map(c=>{
      const compatible=rows.filter(r=>r.route.ok&&r.route.plan.rendererRequirement?.capability===c.id&&satisfiesVersionRange(c.version,r.route.plan.rendererRequirement.range)).map(r=>r.activity.id).sort();
      const implementation=IMPLEMENTATIONS[c.id]??null;
      return {
        capability:c.id,rendererVersion:c.version,rendererModelSchema:c.rendererModelSchema,intents:c.intents,
        implementation,implementationExists:Boolean(implementation&&fs.existsSync(path.join(base,implementation))),
        accessibility:c.accessibility,compatibleActivities:compatible,
        status:compatible.length?'ACTIVE':'REGISTERED_UNUSED',
      };
    }),
  };
}

export function buildMigrationReport(base=root){
  const {rows}=plans(base);
  const foundation=JSON.parse(fs.readFileSync(path.join(base,'reports/renderer-foundation-readiness.json'),'utf8'));
  const withRequirement=rows.filter(r=>r.route.ok&&r.route.plan.rendererRequirement);
  const blocked=rows.filter(r=>r.readiness?.reasons.includes('RENDERER_UNAVAILABLE'));
  const registryRendered=withRequirement.filter(r=>!r.readiness.reasons.includes('RENDERER_UNAVAILABLE'));
  const legacy=rows.filter(r=>r.route.ok&&!r.route.plan.rendererRequirement);
  return {
    schema:'kimyolab.renderer-migration.v1',
    semantics:'Strangler migration: an activity with a rendererRequirement is drawn by the RendererRegistry; every other routed activity keeps the legacy practice renderer unchanged.',
    totalActivities:rows.length,
    registryRendered:registryRendered.length,
    legacyRendered:legacy.length,
    rendererBlocked:blocked.length,
    unrouted:rows.filter(r=>!r.route.ok).length,
    registryActivities:registryRendered.map(r=>({activityId:r.activity.id,capability:r.route.ok?r.route.plan.rendererRequirement!.capability:null,runtime:r.readiness.runtime})),
    legacyByEngine:legacy.reduce((m:Record<string,number>,r)=>{m[r.activity.type]=(m[r.activity.type]??0)+1;return m;},{}),
    futureCandidates:(foundation.rows??[]).filter((r:any)=>r.rank&&!r.implemented).map((r:any)=>({candidate:r.candidate,rank:r.rank,learnerUiPath:r.learnerUiPath.verdict,blockers:r.blockers,dependency:null})),
    notCandidates:(foundation.rows??[]).filter((r:any)=>!r.rank).map((r:any)=>({candidate:r.candidate,reason:r.blockers})),
  };
}

export async function buildAtomReport(base=root){
  const target=deriveAtomState({protons:6,neutrons:8,electrons:6});
  // display names come from the localization content (as in the app), never from the domain
  const localeFile='content-src/locales/uz-latn/chemistry-elements.json';
  const localeRaw=JSON.parse(fs.readFileSync(path.join(base,localeFile),'utf8'));
  const names=elementNameMapper(parseElementNameCatalog(localeRaw));
  const probes=[[6,8,6],[11,12,10],[8,8,10],[6,6,6]].map(([p,n,e])=>{
    const state=deriveAtomState({protons:p!,neutrons:n!,electrons:e!});
    const model=toAtomRendererModel({finalState:state,goal:target,evidence:[]},names);
    return {counts:{protons:p,neutrons:n,electrons:e},domain:{element:state.element,isotope:state.isotope,charge:state.charge},renderer:{isotopeLabel:model.isotopeLabel,chargeLabel:model.chargeLabel,accessibleSummary:model.accessibleSummary}};
  });
  const distinct=new Set(probes.map(p=>JSON.stringify(p.renderer))).size===probes.length;
  const baseline=JSON.parse(fs.readFileSync(path.join(base,'tests/fixtures/atom-legacy-baseline.json'),'utf8'));
  const current=await runAtomParity(base,(particle:any,delta:any)=>atomIntent(particle,delta));
  const parity=JSON.stringify(current)===JSON.stringify(baseline);
  const e2e=path.join(base,'tests/e2e/renderer-atom.spec.mjs');
  const e2eText=fs.existsSync(e2e)?fs.readFileSync(e2e,'utf8'):'';
  const cap=RENDERER_CATALOG.find(c=>c.id==='atom-builder')!;
  return {
    schema:'kimyolab.reference-renderer-atom.v1',
    capability:`${cap.id}@${cap.version}`,
    modelBased:distinct,
    blackSwan:{claim:'different p/n/e → different domain state → different renderer model',probes,distinctRendererModels:distinct},
    domainSource:['src/domain/chemistry/periodic-table.ts','src/domain/chemistry/atom.ts'],
    localization:{elementNames:localeFile,mapper:'src/features/localization/element-names.ts#elementNameMapper',reviewSurface:'CHEM-033',reviewStatus:String(localeRaw.reviewStatus)},
    converter:'src/renderers/atom-builder/renderer-model.ts#toAtomRendererModel',
    rendererModelSchema:ATOM_RENDERER_MODEL_SCHEMA,
    intents:{kinds:cap.intents,shape:atomIntent('protons',1)},
    accessibility:cap.accessibility,
    keyboardE2E:{spec:'tests/e2e/renderer-atom.spec.mjs',keyboardOnly:/keyboard\.press/.test(e2eText)&&!/\.click\(/.test(e2eText),present:e2eText.length>0},
    evidenceParity:{baseline:'tests/fixtures/atom-legacy-baseline.json (recorded from the pre-P1.4 code on main f45659e)',equal:parity,completedAtStep:current.completedAtStep,sequenceLength:current.sequence.length},
    knownLimitations:[
      'element names are Uzbek school names for Z ≤ 20; beyond that the symbol is shown',
      'no shell/orbital view (electron configuration exists in the domain but is not drawn)',
      'intents are ±1 per particle (the pre-P1.4 command contract); no direct numeric entry',
      'evidence targetId comes from the content config target (unchanged, for parity)',
    ],
  };
}

/**
 * P1.5 hydrolysis reference renderer report. Every value is measured by driving the REAL stack (ContentClient →
 * ReferencePracticeSession → adapter → HydrolysisModel) with the renderer's own intents and the canonical
 * converter. `status` is FAIL when the flow is canned (one outcome for every salt), when the learner has no
 * decision, when a prediction after the reveal still earns credit, or when renderer ≠ domain.
 * `hydrolysisData` overrides the content (used by tests to prove that a canned model FAILs).
 */
export async function buildHydrolysisReport(base=root,options:{hydrolysisData?:unknown}={}){
  const LEAD='practice.experiment.9.14';
  const client=new ContentClient({fetchImpl:diskFetch(base) as any,baseUrl:'/content'});
  const page:any=await client.loadPractice(LEAD);
  if(options.hydrolysisData!==undefined) page.chemistry={...page.chemistry,hydrolysis:options.hydrolysisData};
  const model=HydrolysisModel.from(page.chemistry.hydrolysis);
  const run=async(actions:any[])=>{ const session=new ReferencePracticeSession(page); let r:any=await session.result(); for(const a of actions) r=await session.apply(hydrolysisIntent(a,page.type)); return r; };
  const salts=model.salts();
  const probes=[];
  for(const salt of salts){
    const domain=(model.classify(salt) as any).medium;
    // a deliberately fixed prediction ('neutral') so right AND wrong predictions are exercised
    const r=await run([{type:'selectSalt',payload:{salt}},{type:'predictMedium',payload:{medium:'neutral'}},{type:'addIndicator'}]);
    const m=toHydrolysisRendererModel(r);
    const ev=r.evidence.find((e:any)=>e.selectedSalt===salt);
    probes.push({salt,domainMedium:domain,engineActualMedium:ev?.actualMedium??null,rendererObservation:m.observation?.text??null,rendererMedium:m.observation?.medium??null,predicted:'neutral',correct:ev?.correct??null,score:ev?.score??null});
  }
  const outcomes=new Set(probes.map(p=>p.rendererObservation));
  const evidenceParity=probes.every(p=>p.engineActualMedium===p.domainMedium&&p.rendererMedium===p.domainMedium&&p.correct===(p.domainMedium==='neutral'));
  const target=page.referenceConfig.salt, targetMedium=(model.classify(target) as any).medium;
  const before=await run([{type:'selectSalt',payload:{salt:target}},{type:'predictMedium',payload:{medium:targetMedium}},{type:'addIndicator'}]);
  const after=await run([{type:'selectSalt',payload:{salt:target}},{type:'addIndicator'},{type:'predictMedium',payload:{medium:targetMedium}}]);
  const lateEv=after.evidence.find((e:any)=>e.selectedSalt===target);
  const predictionBeforeReveal={
    beforeRevealCompletes:isPracticeResultComplete(page.type,before),
    afterRevealCompletes:isPracticeResultComplete(page.type,after),
    afterRevealScore:lateEv?.score??null,afterRevealRecorded:Boolean(lateEv),
  };
  const unmodeled=await run([{type:'selectSalt',payload:{salt:'NOT_A_MODELED_SALT'}},{type:'addIndicator'}]);
  const unmodeledFailsClosed=unmodeled.finalState.hydrolysis.current.observation===null&&unmodeled.finalState.hydrolysis.rejected!==null&&!isPracticeResultComplete(page.type,unmodeled);
  const offered=toHydrolysisRendererModel(await run([])).salts.map(s=>s.id);
  const learnerDecision={offeredSalts:offered,offeredEqualsModeled:JSON.stringify(offered)===JSON.stringify(salts),choiceChangesOutcome:outcomes.size>1,intents:['selectSalt','predictMedium','addIndicator']};
  const e2e=path.join(base,'tests/e2e/renderer-hydrolysis.spec.mjs');
  const e2eText=fs.existsSync(e2e)?fs.readFileSync(e2e,'utf8'):'';
  const cap=RENDERER_CATALOG.find(c=>c.id==='hydrolysis-medium')!;
  const modelBased=outcomes.size>=2&&evidenceParity;
  const checks={
    modelBased,
    distinctOutcomesAtLeastTwo:outcomes.size>=2,
    learnerDecision:learnerDecision.offeredEqualsModeled&&learnerDecision.choiceChangesOutcome,
    predictionBeforeReveal:predictionBeforeReveal.beforeRevealCompletes&&!predictionBeforeReveal.afterRevealCompletes&&predictionBeforeReveal.afterRevealScore===0&&predictionBeforeReveal.afterRevealRecorded,
    evidenceParity,
    unmodeledFailsClosed,
  };
  return {
    schema:'kimyolab.reference-renderer-hydrolysis.v1',
    capability:`${cap.id}@${cap.version}`,
    status:Object.values(checks).every(Boolean)?'PASS':'FAIL',
    checks,
    modelBased,
    modeledSalts:salts,
    distinctOutcomes:outcomes.size,
    probes,
    learnerDecision,
    predictionBeforeReveal,
    evidenceParity:{claim:'engine evidence actualMedium = renderer observation = HydrolysisModel.classify(salt) for every modeled salt',equal:evidenceParity},
    unmodeledFailsClosed,
    domainSource:['src/domain/chemistry/hydrolysis-model.ts','src/domain/chemistry/hydrolysis-trial.ts','content-src/chemistry/hydrolysis.json'],
    contentReviewStatus:{records:[...new Set((page.chemistry.hydrolysis.records??[]).map((r:any)=>r.reviewStatus))],indicator:page.chemistry.hydrolysis.indicator?.reviewStatus??null},
    converter:'src/renderers/hydrolysis-medium/renderer-model.ts#toHydrolysisRendererModel',
    rendererModelSchema:HYDROLYSIS_RENDERER_MODEL_SCHEMA,
    intents:{kinds:cap.intents,shape:hydrolysisIntent({type:'selectSalt',payload:{salt:target}},'experiment')},
    accessibility:{...cap.accessibility,keyboardE2E:{spec:'tests/e2e/renderer-hydrolysis.spec.mjs',present:e2eText.length>0,keyboardOnly:/keyboard\.press/.test(e2eText)&&!/\.click\(/.test(e2eText)}},
    knownLimitations:[
      'only 4 salts are modeled (content-src/chemistry/hydrolysis.json, review pending); the indicator (litmus) colours are content too, review pending',
      'salts are shown as formulas (no localized salt names yet)',
      'one indicator; no pH scale or quantitative hydrolysis',
    ],
  };
}

/**
 * P1.6 ionic precipitation reference renderer report. Every value is measured by driving the REAL stack with the
 * renderer's intents over EVERY pair of the content shelf. `status` FAILS when the flow is canned (fewer than two
 * distinct modeled results), when the learner has no real choice, when an unmodeled pair produces anything but a
 * fail-closed coverage message, when equation validation is not order-insensitive, or when renderer ≠ domain.
 * `reactions` overrides the KB (used by tests to prove that a canned KB FAILs).
 */
export async function buildIonicReport(base=root,options:{reactions?:unknown[]}={}){
  const LEAD='practice.experiment.8.1';
  const client=new ContentClient({fetchImpl:diskFetch(base) as any,baseUrl:'/content'});
  const page:any=await client.loadPractice(LEAD);
  if(options.reactions) page.chemistry={...page.chemistry,reactions:options.reactions};
  const run=async(actions:any[])=>{ const session=new ReferencePracticeSession(page); let r:any=await session.result(); for(const a of actions) r=await session.apply(ionicIntent(a,page.type)); return r; };
  const start=toIonicPrecipitationRendererModel(await run([]));
  const shelf=start.reagents.map(r=>r.id);
  const pairs=[];
  for(let i=0;i<shelf.length;i++) for(let j=i+1;j<shelf.length;j++){
    const r=await run([{type:'selectReagent',payload:{slot:'A',speciesId:shelf[i]}},{type:'selectReagent',payload:{slot:'B',speciesId:shelf[j]}},{type:'mix'}]);
    const cur=r.finalState.ionic.current, m=toIonicPrecipitationRendererModel(r);
    const obs=r.evidence.filter((e:any)=>e.observationKind==='ionic-mixing');
    pairs.push({reagents:[shelf[i],shelf[j]],outcome:cur.outcome,reactionId:cur.reactionId,coverageCode:cur.coverageCode,rendererState:m.reactionState,observation:m.observation?.text??null,observationEvidence:obs.length,kbObservations:cur.observations});
  }
  const modeled=pairs.filter(p=>p.outcome!=='not-modeled');
  const distinct=new Set(modeled.map(p=>`${p.outcome}:${p.reactionId}`)).size;
  const stateMap:Record<string,string>={reaction:'modeled-reaction','no-reaction':'modeled-no-reaction','not-modeled':'not-modeled'};
  const evidenceParity=pairs.every(p=>p.rendererState===stateMap[p.outcome]&&(p.outcome==='not-modeled'?p.observationEvidence===0:p.observationEvidence===1));
  const unmodeledFailClosed=pairs.filter(p=>p.outcome==='not-modeled').every(p=>p.observationEvidence===0&&p.kbObservations===null&&/modelda yo‘q/.test(p.observation??'')&&!/reaksiya bormaydi \(/.test(p.observation??''));
  // equation validation (the expected equation comes from IonicEngine, never from this report)
  const target=page.referenceConfig.reactionId;
  const rx=page.chemistry.reactions.find((x:any)=>x.id===target);
  const idOf=(f:string)=>page.chemistry.species.find((x:any)=>x.formula===f)?.id;
  const expected=IonicEngine.from({reactions:page.chemistry.reactions,rules:page.chemistry.solutionRules}).netIonicEquation(target).equation;
  const [left,right]=expected.split(' → ');
  const swapped=`${left!.split(' + ').reverse().join(' + ')} -> ${right}`;
  const mixTarget=[{type:'selectReagent',payload:{slot:'A',speciesId:idOf(rx.reactants[0].formula)}},{type:'selectReagent',payload:{slot:'B',speciesId:idOf(rx.reactants[1].formula)}},{type:'mix'}];
  const verdict=async(eq:string)=>{ const r=await run([...mixTarget,{type:'writeEquation',payload:{equation:eq}}]); return {accepted:r.finalState.ionic.equations.at(-1)?.correct??null,syntaxRejected:r.finalState.ionic.rejected==='EQUATION_SYNTAX',complete:isPracticeResultComplete(page.type,r),answerEvidence:r.evidence.filter((e:any)=>e.answerKind==='net-ionic-equation').length}; };
  const canonical=await verdict(expected), reordered=await verdict(swapped), wrong=await verdict(`${left} -> ${right!.replace('(s)','(aq)')}`), syntax=await verdict('Ag+ Cl- AgCl');
  const equationValidation={authority:'IonicEngine.netIonicEquation + compareNetIonic',canonicalAccepted:canonical.accepted===true&&canonical.complete,reorderedAccepted:reordered.accepted===true,wrongRejectedAsEvidence:wrong.accepted===false&&wrong.answerEvidence===1&&!wrong.complete,syntaxErrorNotEvidence:syntax.syntaxRejected&&syntax.answerEvidence===0};
  const expectedHidden=!JSON.stringify(toIonicPrecipitationRendererModel(await run(mixTarget))).includes(expected);
  const learnerChoice={availableReagents:shelf.length,pairs:pairs.length,choiceChangesOutcome:distinct>=2,fixedScript:false};
  const e2e=path.join(base,'tests/e2e/renderer-ionic.spec.mjs');
  const e2eText=fs.existsSync(e2e)?fs.readFileSync(e2e,'utf8'):'';
  const cap=RENDERER_CATALOG.find(c=>c.id==='ionic-precipitation')!;
  const checks={
    modelBased:distinct>=2&&evidenceParity,
    learnerChoice:learnerChoice.choiceChangesOutcome&&shelf.length>=2,
    unmodeledFailClosed,
    equationValidation:Object.values(equationValidation).filter(v=>typeof v==='boolean').every(Boolean),
    expectedEquationHidden:expectedHidden,
    evidenceParity,
  };
  return {
    schema:'kimyolab.reference-renderer-ionic-precipitation.v1',
    capability:`${cap.id}@${cap.version}`,
    status:Object.values(checks).every(Boolean)?'PASS':'FAIL',
    checks,
    modelBased:checks.modelBased,
    availableReagents:start.reagents.map(r=>({speciesId:r.id,label:r.label})),
    modeledPairs:modeled.map(p=>({reagents:p.reagents,outcome:p.outcome,reactionId:p.reactionId,observation:p.observation})),
    modeledNoReactionPairs:modeled.filter(p=>p.outcome==='no-reaction').length,
    notModeledPairs:pairs.length-modeled.length,
    distinctOutcomes:distinct,
    learnerChoice,
    unmodeledFailClosed,
    equationValidation,
    evidenceParity:{claim:'for every shelf pair: renderer state = ReactionMatcher outcome; one observation evidence per modeled pair, none for an unmodeled pair',equal:evidenceParity},
    domainSource:['src/domain/chemistry/ionic-mixing.ts','src/domain/chemistry/reaction-matcher.ts','src/domain/chemistry/ionic-engine.ts','src/domain/chemistry/ionic-equation.ts','content-src/chemistry/reactions.json','content-src/chemistry/solubility.json','content-src/chemistry/species.json'],
    converter:'src/renderers/ionic-precipitation/renderer-model.ts#toIonicPrecipitationRendererModel',
    rendererModelSchema:IONIC_RENDERER_MODEL_SCHEMA,
    intents:{kinds:cap.intents,shape:ionicIntent({type:'selectReagent',payload:{slot:'A',speciesId:shelf[0]!}},'experiment')},
    accessibility:{...cap.accessibility,keyboardE2E:{spec:'tests/e2e/renderer-ionic.spec.mjs',present:e2eText.length>0,keyboardOnly:/keyboard\.press/.test(e2eText)&&!/\.click\(/.test(e2eText)}},
    knownLimitations:[
      `only ${modeled.length} of the ${pairs.length} shelf pairs are modeled in reactions.json (review pending); the others fail closed as "not modeled"`,
      'the KB has no explicit no-reaction records yet: the domain supports them (reactionType "no-reaction"), no data asserts one',
      'the shelf holds only solution reagents with dissociation rules (IonicEngine can compute their net ionic equation)',
      'phases in the learner equation are optional; a coefficient multiple (2Ag+ + 2Cl- → 2AgCl) is not the net equation',
    ],
  };
}

/**
 * P2.6 condition-prediction reference renderer report — measured PER ACTIVITY by driving the REAL stack (ContentClient →
 * ReferencePracticeSession → adapter → condition-trial.ts → EquilibriumModel / ManganeseRedoxModel) with the renderer's
 * own intents and the canonical converter. An activity is model-based only when ITS OWN modeled conditions reach ≥2
 * distinct domain outcomes, renderer = engine = domain for every condition, the reveal needs a prediction, a late
 * prediction is refused, unmodeled input fails closed and every label resolves from the catalog.
 * `chemistry` overrides the page's chemistry data (used by tests to prove that a canned model FAILs).
 */
export async function buildConditionReport(base=root,options:{chemistry?:Record<string,unknown>}={}){
  const client=new ContentClient({fetchImpl:diskFetch(base) as any,baseUrl:'/content'});
  const interaction=parseInteractionCatalog(JSON.parse(fs.readFileSync(path.join(base,'content-src/locales/uz-latn/learner-interaction.json'),'utf8')));
  const localize=createLocalizer({interaction});
  const ids=buildRegistryReport(base).renderers.find(r=>r.capability==='condition-prediction')?.compatibleActivities??[];
  const activities=[];
  for(const id of ids){
    const page:any=await client.loadPractice(id);
    if(options.chemistry) page.chemistry={...page.chemistry,...options.chemistry};
    const run=async(actions:any[])=>{ const session=new ReferencePracticeSession(page); let r:any=await session.result(); for(const a of actions) r=await session.apply(conditionIntent(a,page.type)); return r; };
    const start:any=await run([]);
    const state=start.finalState.condition, first=state.outcomeOptions[0];
    const probes=[];
    for(const condition of state.conditions){
      // a deliberately fixed prediction (the first option) so right AND wrong predictions are exercised
      const r=await run([{type:'selectCondition',payload:{condition}},{type:'predictOutcome',payload:{outcome:first}},{type:'reveal'}]);
      const m=toConditionRendererModel(r,localize); const ev=r.evidence.find((e:any)=>e.type==='answer');
      probes.push({condition,engineOutcome:r.finalState.condition.trials[0]?.actual??null,rendererOutcome:m.observation?.outcome??null,rendererText:m.observation?.text??null,predicted:first,correct:ev?.correct??null,score:ev?.score??null});
    }
    const outcomes=new Set(probes.map(p=>p.engineOutcome));
    const evidenceParity=probes.every(p=>p.engineOutcome!==null&&p.rendererOutcome===p.engineOutcome&&p.correct===(p.engineOutcome===first)&&p.score===(p.correct?1:0));
    const target=state.targetCondition, targetOutcome=probes.find(p=>p.condition===target)?.engineOutcome;
    const select={type:'selectCondition',payload:{condition:target}};
    const success=await run([select,{type:'predictOutcome',payload:{outcome:targetOutcome}},{type:'reveal'}]);
    const noPrediction=await run([select,{type:'reveal'}]);
    const wrongFirst=state.outcomeOptions.find((o:string)=>o!==targetOutcome);
    const late=await run([select,{type:'predictOutcome',payload:{outcome:wrongFirst}},{type:'reveal'},{type:'predictOutcome',payload:{outcome:targetOutcome}}]);
    const beforeReveal=await run([select,{type:'predictOutcome',payload:{outcome:targetOutcome}}]);
    const wrongOutcome=state.outcomeOptions.find((o:string)=>o!==targetOutcome);
    const wrong=await run([select,{type:'predictOutcome',payload:{outcome:wrongOutcome}},{type:'reveal'}]);
    const again=await run([select,{type:'predictOutcome',payload:{outcome:wrongOutcome}},{type:'reveal'},select]);
    const unmodeled=await run([{type:'selectCondition',payload:{condition:'NOT_A_MODELED_CONDITION'}},{type:'reveal'}]);
    const foreign=await run([select,{type:'predictOutcome',payload:{outcome:'NOT_A_MODELED_OUTCOME'}}]);
    const bm=toConditionRendererModel(beforeReveal,localize);
    const checks={
      modelBased:outcomes.size>=2&&evidenceParity,
      distinctOutcomesAtLeastTwo:outcomes.size>=2,
      evidenceParity,
      learnerDecision:state.conditions.length>=2,
      predictionBeforeReveal:isPracticeResultComplete(page.type,success)&&noPrediction.finalState.condition.rejected==='PREDICTION_REQUIRED'&&noPrediction.finalState.condition.trials.length===0&&!isPracticeResultComplete(page.type,noPrediction)
        &&late.finalState.condition.rejected==='PREDICTION_LOCKED'&&late.finalState.condition.trials.length===1&&late.finalState.condition.trials[0].predicted===wrongFirst&&!isPracticeResultComplete(page.type,late),
      outcomeHiddenBeforeReveal:bm.observation===null&&beforeReveal.finalState.condition.current.outcome===null&&beforeReveal.evidence.every((e:any)=>e.type!=='answer'),
      wrongPredictionIsEvidenceNotCompletion:wrong.evidence.some((e:any)=>e.type==='answer'&&e.correct===false&&e.score===0)&&!isPracticeResultComplete(page.type,wrong),
      oneTrialPerCondition:again.finalState.condition.rejected==='CONDITION_ALREADY_TRIED'&&!isPracticeResultComplete(page.type,again),
      unmodeledFailsClosed:unmodeled.finalState.condition.rejected!==null&&unmodeled.finalState.condition.trials.length===0&&!isPracticeResultComplete(page.type,unmodeled),
      outcomeOutsideModelRejected:foreign.finalState.condition.rejected==='OUTCOME_NOT_IN_MODEL'&&foreign.finalState.condition.current.predicted===null,
      labelsLocalized:toConditionRendererModel(success,localize).missingKeys.length===0&&probes.every(p=>!!p.rendererText&&!p.rendererText.includes('…')),
    };
    activities.push({activityId:id,kind:state.kind,status:Object.values(checks).every(Boolean)?'PASS':'FAIL',checks,conditions:state.conditions,outcomeOptions:state.outcomeOptions,targetCondition:target,distinctOutcomes:outcomes.size,probes});
  }
  const cap=RENDERER_CATALOG.find(c=>c.id==='condition-prediction')!;
  const e2e=path.join(base,'tests/e2e/renderer-condition.spec.mjs');
  const e2eText=fs.existsSync(e2e)?fs.readFileSync(e2e,'utf8'):'';
  return {
    schema:'kimyolab.reference-renderer-condition-prediction.v1',
    capability:`${cap.id}@${cap.version}`,
    status:activities.length>0&&activities.every(a=>a.status==='PASS')?'PASS':'FAIL',
    semantics:'judged per activity: an activity bound to this renderer is model-based only when its own modeled conditions reach ≥2 distinct domain outcomes through the real stack',
    activities,
    domainSource:['src/domain/chemistry/condition-trial.ts','src/domain/chemistry/equilibrium-model.ts','src/domain/chemistry/manganese-redox-model.ts','content-src/chemistry/equilibrium.json','content-src/chemistry/manganese-redox.json'],
    converter:'src/renderers/condition-prediction/renderer-model.ts#toConditionRendererModel',
    rendererModelSchema:CONDITION_RENDERER_MODEL_SCHEMA,
    intents:{kinds:cap.intents,shape:conditionIntent({type:'reveal'},'simulation')},
    accessibility:{...cap.accessibility,keyboardE2E:{spec:'tests/e2e/renderer-condition.spec.mjs',present:e2eText.length>0,keyboardOnly:/keyboard\.press/.test(e2eText)&&!/\.click\(/.test(e2eText)}},
    knownLimitations:[
      'equilibrium: one reaction system (haber) with two modeled perturbations (content-src/chemistry/equilibrium.json, review pending)',
      'manganese: three modeled media → three products (content-src/chemistry/manganese-redox.json, review pending)',
      'the records\' explanations/observations are English-only and are not shown; only structured results (shift label, product formula) are displayed — translation is human work',
      'perturbation and system labels are new display text in the learner-interaction catalog (review pending)',
    ],
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const write=(rel:string,body:unknown)=>fs.writeFileSync(path.join(root,rel),`${JSON.stringify(body,null,2)}\n`,'utf8');
  const registry=buildRegistryReport();const migration=buildMigrationReport();const atom=await buildAtomReport();const hydrolysis=await buildHydrolysisReport();const ionic=await buildIonicReport();const condition=await buildConditionReport();
  write(REGISTRY_REPORT,registry);write(MIGRATION_REPORT,migration);write(ATOM_REPORT,atom);write(HYDROLYSIS_REPORT,hydrolysis);write(IONIC_REPORT,ionic);write(CONDITION_REPORT,condition);
  console.log(JSON.stringify({renderers:registry.renderers.length,registryRendered:migration.registryRendered,legacyRendered:migration.legacyRendered,rendererBlocked:migration.rendererBlocked,atomModelBased:atom.modelBased,evidenceParity:atom.evidenceParity.equal,hydrolysis:hydrolysis.status,hydrolysisDistinctOutcomes:hydrolysis.distinctOutcomes,ionic:ionic.status,conditionPrediction:condition.status,ionicDistinctOutcomes:ionic.distinctOutcomes}));
  if(!registry.catalogMatchesRegistry||!atom.modelBased||!atom.evidenceParity.equal||hydrolysis.status!=='PASS'||ionic.status!=='PASS'||condition.status!=='PASS'){console.error('RENDERER_REPORT_INVARIANT_FAILED');process.exitCode=1;}
}
