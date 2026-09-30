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

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const REGISTRY_REPORT='reports/renderer-registry.json';
export const MIGRATION_REPORT='reports/renderer-migration.json';
export const ATOM_REPORT='reports/reference-renderer-atom.json';
export const HYDROLYSIS_REPORT='reports/reference-renderer-hydrolysis.json';
/** Where each registered capability is implemented (checked to exist). */
const IMPLEMENTATIONS:Record<string,string>={'atom-builder':'src/renderers/atom-builder/renderer.ts','hydrolysis-medium':'src/renderers/hydrolysis-medium/renderer.ts'};

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
    futureCandidates:(foundation.rows??[]).filter((r:any)=>r.rank&&!r.implemented).map((r:any)=>({candidate:r.candidate,rank:r.rank,learnerUiPath:r.learnerUiPath.verdict,blockers:r.blockers,dependency:r.candidate==='ionic-precipitation'?'reagent-choice intent (learner-chosen reactants) — the adapter accepts payload.reactants, the UI does not expose it yet':null})),
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

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const write=(rel:string,body:unknown)=>fs.writeFileSync(path.join(root,rel),`${JSON.stringify(body,null,2)}\n`,'utf8');
  const registry=buildRegistryReport();const migration=buildMigrationReport();const atom=await buildAtomReport();const hydrolysis=await buildHydrolysisReport();
  write(REGISTRY_REPORT,registry);write(MIGRATION_REPORT,migration);write(ATOM_REPORT,atom);write(HYDROLYSIS_REPORT,hydrolysis);
  console.log(JSON.stringify({renderers:registry.renderers.length,registryRendered:migration.registryRendered,legacyRendered:migration.legacyRendered,rendererBlocked:migration.rendererBlocked,atomModelBased:atom.modelBased,evidenceParity:atom.evidenceParity.equal,hydrolysis:hydrolysis.status,hydrolysisDistinctOutcomes:hydrolysis.distinctOutcomes}));
  if(!registry.catalogMatchesRegistry||!atom.modelBased||!atom.evidenceParity.equal||hydrolysis.status!=='PASS'){console.error('RENDERER_REPORT_INVARIANT_FAILED');process.exitCode=1;}
}
