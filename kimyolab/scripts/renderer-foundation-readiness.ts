// renderer:readiness (P1.3 §39) — analysis input for the P1.4 RendererRegistry decision. NO renderer code.
// Facts are computed from the repository (activities per capability, chemistry data size, whether the
// learner's own UI command path can reach the model and succeed); judgements are authored below with their
// reasons. Deterministic output: reports/renderer-foundation-readiness.json.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSources} from './learning-readiness.ts';
import {compileReadiness} from './lib/readiness-compile.ts';
import {diskFetch} from './pilot-status.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {atomIntent} from '../src/renderers/atom-builder/renderer.ts';
import {hydrolysisIntent} from '../src/renderers/hydrolysis-medium/renderer.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const RENDERER_REPORT_FILE='reports/renderer-foundation-readiness.json';

interface CandidateSpec {
  id:string;
  title:string;
  leadActivityId:string;
  family:(configSource:string,config:any)=>boolean;
  modelData:string[];
  domainModel:string;
  /** Authored judgement (reasons in the P1.4 contract document). */
  assessment:{pedagogicalValue:string;currentLimitation:string;engineMaturity:string;interactionDepth:string;accessibilityComplexity:string;reusePotential:string;blackSwan:string;accessibilityPlan:string;dependencies:string[]};
  rank:number|null;
  /** set when a registered reference renderer exists for this candidate */
  implemented?:string;
  /** false when no single correct input can be derived for the family (different task per activity). */
  evaluateUiPath?:boolean;
}

const CANDIDATES:CandidateSpec[]=[
  {
    id:'atom-builder',title:'Atom tuzilishi konstruktori (p/n/e → element, izotop, zaryad)',leadActivityId:'practice.simulation.7.07.planned',
    family:(s,c)=>s==='reference-slices'&&c.sliceId==='slice.7.07.atom-builder',modelData:[],domainModel:'StatefulSimulationEngine reducer (derive: Z → element, A = p+n, charge = p−e); electronConfiguration(Z≤36) in src/domain/chemistry',
    assessment:{pedagogicalValue:'high — every learner action changes a derived chemical identity (element, isotope, ion); core 7th-grade concept',currentLimitation:'P1.4: element identity in the domain periodic table (Z 1–118), Uzbek names in localization content (Z≤20); DOM + text-state renderer only — no shell/orbital view yet',engineMaturity:'mature: pure reducer, serialize/restore, construction evidence',interactionDepth:'real model-based: arbitrary particle combinations → derived state (not a fixed path)',accessibilityComplexity:'low — the state is naturally textual; +/- buttons are keyboard operable',reusePotential:'high — ions, isotopes, electron configuration (lu.8.x), atomic-orbital model (practice.simulation.11.01)',blackSwan:'PASS — model-based: the renderer only draws state the reducer derived; no canned sequence',accessibilityPlan:'text summary of the derived state (element, A, charge) announced via aria-live; buttons with explicit labels; no colour-only cues; reduced motion = no particle animation',dependencies:[]},
    rank:1,implemented:'P1.4 — RendererRegistry capability atom-builder@1.0.0 (src/renderers/atom-builder)',
  },
  {
    id:'ionic-precipitation',title:'Ion almashinish / cho‘kma tajribasi (reagentlar → reaksiya, kuzatuv, net-ion tenglama)',leadActivityId:'practice.experiment.8.1',
    family:(s,c)=>s==='reference-slices'&&c.sliceId==='slice.8.16.chloride-precipitation',modelData:['content-src/chemistry/reactions.json','content-src/chemistry/solubility.json'],domainModel:'ReactionMatcher + IonicEngine (reaction KB, observations, net ionic equation)',
    assessment:{pedagogicalValue:'high — predict/observe/explain on precipitation; net-ionic equation checked by the IonicEngine',currentLimitation:'the UI adds the configured reagents in a fixed order; the adapter already accepts learner-chosen reactants (action.payload.reactants) but the UI never offers the choice → today it is a guided sequence',engineMaturity:'mature: ExperimentEngine with dependencies, ReactionMatcher fail-closed on unmodeled reactions',interactionDepth:'model-capable but not yet exposed: with reagent choice, any modeled pair yields its own observation; unmodeled pairs are refused (no invented chemistry)',accessibilityComplexity:'medium — observations must have text equivalents (colour of precipitate), equation input needs a sub/superscript-free syntax',reusePotential:'high — the 28-reaction KB serves 8th/9th-grade reaction experiments and the qualitative tests',blackSwan:'RISK today (fixed reagent sequence = scripted); PASS once the renderer lets the learner choose reagents and shows only what the matcher returns',accessibilityPlan:'observation text for every visual change (precipitate colour + "cho‘kma"), equation field with plain-text syntax and error text, keyboard-only reagent selection, reduced motion = instant state',dependencies:['RendererModel for ExperimentState + matched reaction','reagent-choice intent in the renderer contract (no chemistry in the renderer)']},
    rank:2,
  },
  {
    id:'hydrolysis-medium',title:'Tuz gidrolizi: tuz tanlash → muhitni bashorat qilish → indikator',leadActivityId:'practice.experiment.9.14',
    family:(s,c)=>(s==='beta2-advanced'&&c.capability==='hydrolysis-experiment')||(s==='beta3-advanced'&&c.task==='hydrolysis'),modelData:['content-src/chemistry/hydrolysis.json'],domainModel:'HydrolysisModel.classify(salt) → acidic/basic/neutral',
    assessment:{pedagogicalValue:'high — a genuine prediction (medium) that the model confirms or refutes',currentLimitation:'P1.5: fixed — the hydrolysis-medium renderer sends the chosen salt and the predicted medium; only 4 salts are modeled (content, review pending)',engineMaturity:'model small but fail-closed (unmodeled salt → HYDROLYSIS_NOT_MODELED, no observation)',interactionDepth:'model-based: the learner chooses among the modeled salts and predicts; the domain returns the medium and the indicator colour (3 distinct outcomes)',accessibilityComplexity:'medium — indicator colour needs a text/label equivalent',reusePotential:'medium — practice.simulation.11.11 (beta3 hydrolysis) uses the same renderer and trial scoring',blackSwan:'PASS — learner choice → model verdict; predict-before-reveal enforced in the domain',accessibilityPlan:'salt and medium as labelled radio groups, indicator result as text ("Indikator (lakmus) qizil tusga o‘tdi. Muhit kislotali."), no colour-only feedback',dependencies:['more modeled salts reviewed by a chemist']},
    implemented:'P1.5 — RendererRegistry capability hydrolysis-medium@1.0.0 (src/renderers/hydrolysis-medium)',
    rank:3,
  },
  {
    id:'electrolysis',title:'Elektroliz (golden assessment slice lu.9.15)',leadActivityId:'practice.experiment.9.10',
    family:(s,c)=>(s==='beta2-advanced'&&c.capability==='electrolysis-experiment')||(s==='beta3-advanced'&&c.task==='electrolysis'),modelData:['content-src/chemistry/electrolysis.json'],domainModel:'ElectrolysisModel.resolve(electrolyte, phase, electrode)',
    assessment:{pedagogicalValue:'high — the only unit with objective assessment items (golden assessment slice)',currentLimitation:'one modeled electrolyte (CuCl2, inert electrodes); three fixed clicks produce fixed observations — the learner makes no chemical decision',engineMaturity:'model API is sound but the data holds a single record (review pending)',interactionDepth:'canned: input → the same predetermined outcome',accessibilityComplexity:'medium',reusePotential:'medium once more electrolytes/electrodes are modeled and reviewed',blackSwan:'FAIL today — any renderer would animate a fixed script; must not be called a simulation until learner choices reach a model with more than one record',accessibilityPlan:'observation text per electrode, keyboard step controls (already present)',dependencies:['more electrolysis records (aq/l, inert/active) reviewed by a chemist']},
    rank:null,
  },
  {
    id:'single-field-simulations',title:'Bitta maydonli “simulyatsiya”lar (beta1/beta2-safe/beta3 simulation)',leadActivityId:'practice.simulation.7.02.planned',
    family:(s,c)=>c?.type==='simulation'&&['beta1','beta2-safe','beta3-advanced','beta2-organic'].includes(s)&&!(s==='beta3-advanced'&&c.task==='hydrolysis'),modelData:['content-src/chemistry/kinetics.json','content-src/chemistry/equilibrium.json','content-src/chemistry/organic.json'],domainModel:'value compared with a config value or a small model (see modelData for the record counts)',
    assessment:{pedagogicalValue:'varies',currentLimitation:'the learner types one value into a form field; the “simulation” has no manipulable state',engineMaturity:'uniform but shallow',interactionDepth:'form answer check, not a simulation',accessibilityComplexity:'low',reusePotential:'low as renderer targets until a state model exists per task',blackSwan:'FAIL — a visual layer here would be decoration over a form answer',accessibilityPlan:'n/a until a state model exists',dependencies:['per-task state models (kinetics, equilibrium) before any renderer work']},
    rank:null,evaluateUiPath:false,
  },
];

async function uiPathCanSucceed(client:ContentClient,activityId:string){
  let model:any;
  try{ model=await client.loadPractice(activityId); }catch(e:any){ return {verdict:'NOT_LAUNCHABLE',detail:String(e?.code??e?.message)}; }
  const c=model.referenceConfig;
  let commands:any[]=[];
  // P1.4: a registry-rendered activity is driven by the intents its renderer emits (not the legacy UI model)
  const ui:any=model.executionPlan.rendererRequirement?{kind:'registry'}:buildPracticeUiModel(model);
  if(ui.kind==='registry'){
    const capability=model.executionPlan.rendererRequirement.capability;
    if(capability==='atom-builder') commands=(['protons','neutrons','electrons'] as const).flatMap(p=>Array.from({length:c.target[p]},()=>atomIntent(p,1)));
    else if(capability==='hydrolysis-medium'){
      // P1.5: the intents the hydrolysis renderer emits — choose the target salt, predict (the domain's medium), reveal
      const medium=(HydrolysisModel.from(model.chemistry.hydrolysis).classify(c.salt) as any).medium;
      commands=[{type:'selectSalt',payload:{salt:c.salt}},{type:'predictMedium',payload:{medium}},{type:'addIndicator'}].map(a=>hydrolysisIntent(a as any,model.type));
    }
    else return {verdict:'NOT_EVALUATED',detail:'no intent script for this capability'};
  }
  else if(ui.kind==='experiment'){
    const equation=c.reactionId?IonicEngine.from({reactions:model.chemistry.reactions,rules:model.chemistry.solutionRules}).netIonicEquation(c.reactionId).equation:'';
    // exactly what the rendered controls can send: an action type, plus the equation text field when shown
    commands=ui.controls.map((x:any)=>({kind:'experiment-action',action:{type:x.action,...(x.requiresEquation?{payload:{netIonicEquation:equation}}:{})}}));
  }else if(ui.kind==='simulation') commands=ui.controls.map((x:any)=>({kind:'simulation-action',action:{field:x.field,value:c.expected??c.initialState?.[x.field]}}));
  let result:any;
  try{ const session=new ReferencePracticeSession(model); for(const cmd of commands) result=await session.apply(cmd); }
  catch(e:any){ return {verdict:'ERROR',detail:String(e?.message)}; }
  const achieved=(result?.evidence??[]).some((e:any)=>(e.score??0)>0&&(e.achieved!==false));
  const complete=isPracticeResultComplete(model.type,result);
  return {verdict:complete&&achieved?'CAN_SUCCEED':'CANNOT_SUCCEED',detail:`controls ${commands.length}; complete=${complete}; positive evidence=${achieved}`};
}

export async function buildRendererReadiness(base=root){
  const src=loadSources(base);
  const {pack}=compileReadiness(src);
  const ready=new Set(pack.activities.filter(a=>a.runtime==='READY').map(a=>a.activityId));
  const assessedUnits=new Set(src.bank.items.map((i:any)=>i.learningUnitId));
  const client=new ContentClient({fetchImpl:diskFetch(base) as any,baseUrl:'/content'});
  const rows=[];
  for(const spec of CANDIDATES){
    const activities:string[]=[];
    for(const [source,configs] of Object.entries(src.configs)) for(const [id,config] of Object.entries(configs??{})) if(ready.has(id)&&spec.family(source,config)) activities.push(id);
    activities.sort();
    const records=spec.modelData.map(rel=>{const d=JSON.parse(fs.readFileSync(path.join(base,rel),'utf8'));const n=Array.isArray(d)?d.length:Object.entries(d).filter(([k,v])=>k!=='sourceRefs'&&Array.isArray(v)).reduce((sum,[,v])=>sum+(v as unknown[]).length,0);return {file:rel,records:n};});
    const lead=src.activities.find((a:any)=>a.id===spec.leadActivityId);
    const units=src.mappings.filter((m:any)=>activities.includes(m.practiceActivityId)).map((m:any)=>m.learningUnitId);
    const ui=spec.evaluateUiPath===false?{verdict:'NOT_EVALUATED',detail:'one config value per task; no single derivable input for the family'}:await uiPathCanSucceed(client,spec.leadActivityId);
    const domainModelReady=spec.id!=='single-field-simulations';
    const engineReady=!['ERROR','NOT_LAUNCHABLE'].includes(ui.verdict);
    const contentReady=records.every(r=>r.records>1)&&activities.length>0;
    const interactionModelReady=ui.verdict==='CAN_SUCCEED'&&!/^FAIL|^RISK/.test(spec.assessment.blackSwan);
    const blockers=[
      ...(ui.verdict!=='CAN_SUCCEED'&&ui.verdict!=='NOT_EVALUATED'?[`learner UI path: ${ui.verdict} (${ui.detail})`]:[]),
      ...(records.some(r=>r.records<=1)?[`chemistry data too small for exploration: ${records.filter(r=>r.records<=1).map(r=>`${r.file}=${r.records}`).join(', ')}`]:[]),
      ...(/^FAIL/.test(spec.assessment.blackSwan)?['black-swan: would be canned animation, not a model-based simulation']:[]),
      ...(/^RISK/.test(spec.assessment.blackSwan)?['black-swan risk: learner choice not yet exposed']:[]),
      ...(lead&&!(lead.accessibilityProfile??[]).length?['lead activity has no accessibility profile']:[]),
    ];
    rows.push({
      candidate:spec.id,title:spec.title,rank:spec.rank,implemented:spec.implemented??null,leadActivityId:spec.leadActivityId,
      readyActivities:activities.length,activities,learningUnits:[...new Set(units)].sort(),
      domainModel:spec.domainModel,modelData:records,
      'domainModelReady?':domainModelReady,'engineReady?':engineReady,'contentReady?':contentReady,'interactionModelReady?':interactionModelReady,
      'accessibilityPlan?':spec.assessment.accessibilityPlan,
      'assessmentLinkage?':[...new Set(units)].some(u=>assessedUnits.has(u))?'objective items exist (review pending)':'none — mastery for these units cannot reach MASTERED until an approved assessment exists',
      learnerUiPath:ui,
      assessment:spec.assessment,
      dependencies:spec.assessment.dependencies,
      blockers,
    });
  }
  return {
    schema:'kimyolab.renderer-foundation-readiness.v1',
    semantics:'Analysis only (P1.3 §29–40). No renderer code exists. rank = recommended order for the first reference renderers, by pedagogical value, model depth, data, accessibility and reuse; null = not a first candidate (see blockers).',
    startGate:{
      p12Merged:true,canonicalRuntimeStable:true,canonicalRoutingStable:true,readinessStable:true,
      rendererContractApproved:true,
      goldenSliceTechnicallyValid:'lu.9.15 technically valid after the P1.3 completion fix (pilot:status TECHNICAL_PASS); human assessment approval is a separate product sign-off blocker',
      canStartImplementation:true,
      reason:'contract approved for P1.4 implementation (technical decision; not an assessment approval or pilot sign-off). P1.4 implements the atom-builder reference renderer only.',
    },
    rows,
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await buildRendererReadiness();
  fs.writeFileSync(path.join(root,RENDERER_REPORT_FILE),`${JSON.stringify(report,null,2)}\n`,'utf8');
  for(const r of report.rows) console.log(`${r.rank??'-'}  ${r.candidate}  ready=${r.readyActivities}  ui=${r.learnerUiPath.verdict}  blockers=${r.blockers.length}`);
}
