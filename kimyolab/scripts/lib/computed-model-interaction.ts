// P2.6 — computed model interaction audit (ADR-P2-007). Every candidate that reaches (or claims) a computed chemistry /
// mathematics engine is listed with facts from the REAL domain and the repository: what the learner could control, how
// many distinct domain outcomes those choices reach, whether the content already defines the task, and what would have
// to be invented. Eligibility is derived from the P2.6 rule (F1–F8), never from a quota; `0 eligible` would be a valid
// result. Facts only — no chemistry is added here, and nothing here approves anything.
import fs from 'node:fs';
import path from 'node:path';
import {EquilibriumModel,EQUILIBRIUM_SHIFTS} from '../../src/domain/chemistry/equilibrium-model.ts';
import {ManganeseRedoxModel} from '../../src/domain/chemistry/manganese-redox-model.ts';
import {KineticsModel} from '../../src/domain/chemistry/kinetics-model.ts';
import {electronConfiguration} from '../../src/domain/chemistry/electron-configuration.ts';
import {RENDERER_CATALOG} from '../../src/renderers/catalog.ts';

export const CMI_AUDIT_REPORT='reports/computed-model-interaction-audit.json';
export const CMI_EXPANSION_REPORT='reports/computed-model-interaction-expansion.json';
/** Activities whose route P2.6 changed to a condition-prediction trial (each passes its own black-swan). */
export const P26_CONVERTED:readonly string[]=Object.freeze(['practice.simulation.11.18.planned','practice.simulation.11.20.planned','practice.simulation.9.23.planned']);

/** Facts at the P2.5 merge (9d0e454), the baseline P2.6 is measured against. Bundle numbers were measured on the P2.5
 *  build output (public/app-preview *.js, dist-standalone/KimyoLab_standalone.html) with the same method as `bundle()`. */
export const P25_BASELINE=Object.freeze({
  source:'reports/learning-depth-baseline.json + reports/project-progress.json @ 9d0e454 (P2.5 merge)',
  modelBasedActivities:4,modelBasedUnits:6,learningProduct:11.688,overall:47.013,foundation:100,
  depthOfConverted:{'practice.simulation.11.18.planned':'STATIC_CHECK','practice.simulation.11.20.planned':'STATIC_CHECK','practice.simulation.9.23.planned':'STATIC_CHECK'} as Record<string,string>,
  interactionOfConverted:'FORM',
  chemistryRecords:{reactions:28,species:84,equilibrium:2,manganeseRedox:3,kinetics:3,hydrolysis:4,electrolysis:1},
  bundle:{learnerModules:158,learnerModuleBytes:665773,rendererModules:11,rendererBytes:51742,standaloneBytes:5646313},
});

type Json=any;
const read=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const exists=(root:string,rel:string)=>fs.existsSync(path.join(root,rel));

function chemistry(root:string){
  const raw=(f:string)=>read(root,`content-src/chemistry/${f}`);
  return {
    equilibrium:EquilibriumModel.from(raw('equilibrium.json')),equilibriumRaw:raw('equilibrium.json'),
    manganese:ManganeseRedoxModel.from(raw('manganese-redox.json')),manganeseRaw:raw('manganese-redox.json'),
    kinetics:KineticsModel.from(raw('kinetics.json')),kineticsRaw:raw('kinetics.json'),
    electrolysisRaw:raw('electrolysis.json'),
    counts:{reactions:raw('reactions.json').length??raw('reactions.json').records?.length,species:(()=>{const s=raw('species.json');return Array.isArray(s)?s.length:s.species?.length??s.records?.length;})(),
      equilibrium:raw('equilibrium.json').records.length,manganeseRedox:raw('manganese-redox.json').records.length,kinetics:raw('kinetics.json').records.length,
      hydrolysis:raw('hydrolysis.json').records.length,electrolysis:raw('electrolysis.json').records.length},
  };
}

const A11Y=['keyboard-only operation (native controls)','text equivalent for every visual state (text-state table)','no colour-only information (✓/✗ text)','aria-live summary for screen readers','visible focus','zoom/reflow at 320–375 px','reduced motion (no motion at all)'];
const CODE=(id:string)=>id.replace(/^practice\.[a-z]+\./,'').replace(/\.planned$/,'');

interface Row {
  activityId:string;learningUnitIds:string[];type:string;currentDepth:string;currentInteraction:string;depthBeforeP26:string;
  family:string;source:string;domainModule:string|null;learnerControllableInputs:string[];inputDomain:string;
  distinctReachableOutcomes:string[]|null;invalidInputBehaviour:string;contentDefinesParameters:boolean;
  newChemistryRequired:{required:boolean;what:string[]};rendererReuse:string;evidenceSemantics:string;accessibilityRequirements:string[];
  blackSwan:{pass:boolean;evidence:string}|null;eligible:boolean;status:'CONVERTED'|'ELIGIBLE_NOT_CONVERTED'|'BLOCKED'|'NOT_ELIGIBLE'|'ALREADY_MODEL_BASED'|'OUT_OF_FAMILY';reasons:string[];
  contentScope?:string;
}

export function buildComputedModelAudit(root:string){
  const d=chemistry(root);
  const baseline=read(root,'reports/learning-depth-baseline.json');
  const cond=exists(root,'reports/reference-renderer-condition-prediction.json')?read(root,'reports/reference-renderer-condition-prediction.json'):{activities:[]};
  const acts=new Map<string,Json>(read(root,'content-src/practice-activities.json').map((a:Json)=>[a.id,a]));
  const cfg=(f:string)=>read(root,`content-src/activity-configs/${f}.json`);
  const b3=cfg('beta3-advanced'), b2=cfg('beta2-advanced'), b1=cfg('beta1'), b2s=cfg('beta2-safe'), b3s=cfg('beta3-safe'), org=cfg('beta2-organic'), ref=cfg('reference-slices');
  const base=(id:string)=>baseline.activities.find((a:Json)=>a.activityId===id);
  const rows:Row[]=[];
  const add=(id:string,source:string,r:Partial<Row>&{family:string})=>{
    const b=base(id); const converted=P26_CONVERTED.includes(id);
    const reasons=r.reasons??[];
    const already=!converted&&b?.depth==='MODEL_BASED';
    const status:Row['status']=converted?'CONVERTED':already?'ALREADY_MODEL_BASED':r.status??(reasons.length===0?'ELIGIBLE_NOT_CONVERTED':reasons.some(x=>x.startsWith('NEW_CHEMISTRY_REQUIRED')||x.startsWith('MODEL_')||x.startsWith('CONTENT_')||x.startsWith('OUT_OF_SCOPE'))?'BLOCKED':'NOT_ELIGIBLE');
    rows.push({activityId:id,learningUnitIds:b?.learningUnits??[],type:acts.get(id)?.type??b?.type??'unknown',currentDepth:b?.depth??'NOT_LAUNCHABLE',currentInteraction:b?.interaction??'UNKNOWN',
      depthBeforeP26:converted?P25_BASELINE.depthOfConverted[id]!:(b?.depth??'NOT_LAUNCHABLE'),
      family:r.family,source,domainModule:r.domainModule??null,learnerControllableInputs:r.learnerControllableInputs??[],inputDomain:r.inputDomain??'none',
      distinctReachableOutcomes:r.distinctReachableOutcomes??null,invalidInputBehaviour:r.invalidInputBehaviour??'not applicable',contentDefinesParameters:r.contentDefinesParameters??false,
      newChemistryRequired:r.newChemistryRequired??{required:false,what:[]},rendererReuse:r.rendererReuse??'none',evidenceSemantics:r.evidenceSemantics??'unchanged',
      accessibilityRequirements:r.accessibilityRequirements??A11Y,blackSwan:r.blackSwan??null,
      eligible:converted||(status==='ELIGIBLE_NOT_CONVERTED'),status,reasons:converted||already?[]:reasons,...(r.contentScope?{contentScope:r.contentScope}:{})});
  };
  const condBlackSwan=(id:string)=>{ const a=(cond.activities??[]).find((x:Json)=>x.activityId===id); return a?{pass:a.status==='PASS'&&a.distinctOutcomes>=2,evidence:`real stack (reports/reference-renderer-condition-prediction.json): ${a.conditions.length} conditions → ${a.distinctOutcomes} distinct domain outcomes; unmodeled input fails closed=${a.checks.unmodeledFailsClosed}`}:{pass:false,evidence:'not measured'}; };
  const CONDITION_EVIDENCE='one answer evidence per trial (questionId condition:<kind>:<condition>, response = prediction, made before the reveal) + one construction for the target condition; wrong trials are legitimate evidence; config version 2.0.0 (new semantics, new evidence ids)';

  // ---------------------------------------------------------------- equilibrium (11.18) and the related beta1 8.20
  const haber=d.equilibrium.cases('haber');
  const shiftOf=(p:string)=>(d.equilibrium.resolve('haber',p) as any).shift as string;
  const haberSources=[...new Set(d.equilibriumRaw.records.flatMap((r:Json)=>r.sourceRefs))] as string[];
  add('practice.simulation.11.18.planned','beta3-advanced',{family:'equilibrium',domainModule:'src/domain/chemistry/equilibrium-model.ts (EquilibriumModel.resolve) via condition-trial.ts',
    learnerControllableInputs:['perturbation (condition)','predicted shift'],inputDomain:`perturbations of reaction system "haber": ${haber.join(', ')}; predictions: the closed set ${EQUILIBRIUM_SHIFTS.join(', ')}`,
    distinctReachableOutcomes:[...new Set(haber.map(shiftOf))],invalidInputBehaviour:'unmodeled perturbation → CONDITION_NOT_MODELED; outcome outside the closed set → OUTCOME_NOT_IN_MODEL; reveal without prediction → PREDICTION_REQUIRED; no trial, no evidence',
    contentDefinesParameters:true,contentScope:`equilibrium records are sourced to ${haberSources.join(', ')} (this activity's unit); config names the target perturbation "${b3['practice.simulation.11.18.planned'].perturbation}"`,
    rendererReuse:'condition-prediction@1.0.0 (new reusable primitive, no chemistry)',evidenceSemantics:CONDITION_EVIDENCE,blackSwan:condBlackSwan('practice.simulation.11.18.planned')});
  {
    const own=[b1['practice.simulation.8.20.planned']?.targetState?.pressure==='increase'?'pressure-increase':null].filter(Boolean) as string[];
    add('practice.simulation.8.20.planned','beta1',{family:'equilibrium',domainModule:null,learnerControllableInputs:(b1['practice.simulation.8.20.planned']?.controls??[]),
      inputDomain:'typed/chosen values compared with the config targetState (system, pressure, shift); no domain model is called',distinctReachableOutcomes:own.map(shiftOf),
      invalidInputBehaviour:'legacy form feedback (P2.1)',contentDefinesParameters:true,
      contentScope:`own content defines one perturbation (${own.join(', ')}); the second modeled perturbation belongs to records sourced to ${haberSources.join(', ')}, not to 8.20`,
      blackSwan:{pass:false,evidence:`own perturbations ${own.length} → ${new Set(own.map(shiftOf)).size} distinct modeled outcome`},
      reasons:['NO_COMPUTED_ENGINE_IN_CURRENT_RUNTIME: beta1 compares the config targetState; the equilibrium model is not bound to this activity',
        `CONTENT_SCOPE: only "${own.join(', ')}" is this activity's own content; using the 11.18-sourced temperature record would extend the task beyond its content (F5/F8) — a curriculum/chemistry decision`,
        'BLACK_SWAN_FAIL: with its own perturbation alone the learner reaches 1 distinct outcome'],
    });
  }

  // ---------------------------------------------------------------- manganese redox (9.23, 11.20)
  const media=d.manganese.media(); const product=(m:string)=>d.manganese.resolve(m as any).product;
  const mnSources=[...new Set(d.manganeseRaw.records.flatMap((r:Json)=>r.sourceRefs))] as string[];
  const mnRow=(id:string,source:string,scope:string)=>add(id,source,{family:'manganese-redox',domainModule:'src/domain/chemistry/manganese-redox-model.ts (ManganeseRedoxModel.resolve) via condition-trial.ts',
    learnerControllableInputs:['reaction medium (condition)','predicted product'],inputDomain:`media ${media.join(', ')}; predictions: the model's own products ${[...new Set(media.map(product))].sort().join(', ')}`,
    distinctReachableOutcomes:[...new Set(media.map(product))],invalidInputBehaviour:'unmodeled medium (typo, other language, markup) → CONDITION_NOT_MODELED; no trial, no evidence, no crash (the P2.1 guarantee, now in the domain)',
    contentDefinesParameters:true,contentScope:scope,rendererReuse:'condition-prediction@1.0.0 (new reusable primitive, no chemistry)',evidenceSemantics:CONDITION_EVIDENCE,blackSwan:condBlackSwan(id)});
  mnRow('practice.simulation.9.23.planned','beta2-advanced',`manganese records are sourced to ${mnSources.join(', ')} (this activity's unit); the title asks for a medium-dependent simulation`);
  const title1120=acts.get('practice.simulation.11.20.planned')?.title??'';
  mnRow('practice.simulation.11.20.planned','beta3-advanced',`the activity title names all three media ("${title1120}"); the config already resolved through the same ManganeseRedoxModel before P2.6`);

  // ---------------------------------------------------------------- kinetics (11.16, 11.15; beta1 8.19)
  const effects=[...new Set(d.kineticsRaw.records.map((r:Json)=>r.effect))] as string[];
  const factors=d.kineticsRaw.records.map((r:Json)=>`${r.factor}:${r.change}`) as string[];
  add('practice.simulation.11.16.planned','beta3-advanced',{family:'kinetics',domainModule:'src/domain/chemistry/kinetics-model.ts (KineticsModel.effect)',learnerControllableInputs:['factor + change (would be the condition)'],
    inputDomain:`modeled factor changes: ${factors.join(', ')}`,distinctReachableOutcomes:effects,invalidInputBehaviour:'unmodeled factor → KINETICS_EFFECT_NOT_MODELED',contentDefinesParameters:true,
    blackSwan:{pass:false,evidence:`${factors.length} modeled factor changes → ${effects.length} distinct effect (${effects.join(', ')})`},
    newChemistryRequired:{required:true,what:['kinetics records for the factors the title names but the model lacks (P, V)','any factor change with a different effect']},
    reasons:[`BLACK_SWAN_FAIL: every modeled factor change has the same effect (${effects.join(', ')}); a condition trial would be one answer repeated`,'NEW_CHEMISTRY_REQUIRED: the title names T, P, V and catalyst — P and V have no records (human chemistry work, not invented here)']});
  add('practice.simulation.11.15.planned','beta3-advanced',{family:'kinetics',domainModule:'src/domain/chemistry/kinetics-model.ts (averageReactionRate)',learnerControllableInputs:[],
    inputDomain:`config values: c0=${b3['practice.simulation.11.15.planned'].initialConcentration}, c1=${b3['practice.simulation.11.15.planned'].finalConcentration}, Δt=${b3['practice.simulation.11.15.planned'].deltaSeconds} s; the learner types the rate`,
    distinctReachableOutcomes:null,invalidInputBehaviour:'numeric comparison with the computed rate',contentDefinesParameters:true,
    newChemistryRequired:{required:true,what:['a concentration–time model (rate law / order / rate constant) for the "rate graph" the title asks for']},
    reasons:['ANSWER_VALIDATOR_ONLY: type the final rate → the engine says correct/wrong','CALCULATION_INTENT: letting the learner change c0/c1/Δt and see the rate would show the asked value (F8)','NEW_CHEMISTRY_REQUIRED: a graph needs concentration–time data; the domain has only a two-point average rate']});
  add('practice.simulation.8.19.planned','beta1',{family:'kinetics',domainModule:null,learnerControllableInputs:b1['practice.simulation.8.19.planned']?.controls??[],inputDomain:'values compared with the config targetState (temperature, concentration, surface, rate)',
    distinctReachableOutcomes:effects,invalidInputBehaviour:'legacy form feedback (P2.1)',contentDefinesParameters:true,blackSwan:{pass:false,evidence:`kinetics records reach ${effects.length} distinct effect`},
    newChemistryRequired:{required:true,what:['a surface-area record','any factor change with a different effect']},
    reasons:['NO_COMPUTED_ENGINE_IN_CURRENT_RUNTIME: beta1 compares the config targetState',`BLACK_SWAN_FAIL: the kinetics records reach one effect (${effects.join(', ')})`,'NEW_CHEMISTRY_REQUIRED: surface area is not modeled']});

  // ---------------------------------------------------------------- electron configuration (11.01; beta1 8.06)
  const zMax=36; const configs=new Set(Array.from({length:zMax},(_,i)=>electronConfiguration(i+1)));
  const ecReasons=['ANSWER_LEAK: exploring Z shows exactly the string the activity asks the learner to construct (F8); the engine returns only the final string, no stepwise state to build',
    `MODEL_KNOWN_GAP: the engine fills orbitals in one fixed order for every Z ≤ ${zMax} and has no exception records (e.g. Z=24 → "${electronConfiguration(24)}", Z=29 → "${electronConfiguration(29)}"); exposing Z as a control would present those outputs — chemistry review decides`,
    'TASK_SEMANTICS_NOT_IN_CONTENT: a prediction trial would need a closed option set of configurations (distractors) that content does not define'];
  add('practice.simulation.11.01.planned','beta3-advanced',{family:'electron-configuration',domainModule:'src/domain/chemistry/electron-configuration.ts (electronConfiguration)',learnerControllableInputs:['(would be) atomic number Z'],
    inputDomain:`Z 1–${zMax} (engine range); config fixes Z=${b3['practice.simulation.11.01.planned'].atomicNumber}; the learner types the configuration`,distinctReachableOutcomes:[`${configs.size} distinct configuration strings`],
    invalidInputBehaviour:'Z outside 1–36 → ATOMIC_NUMBER_INVALID',contentDefinesParameters:true,blackSwan:{pass:false,evidence:'not evaluated as model-based: the only reachable "state" is the answer string itself'},
    newChemistryRequired:{required:true,what:['exception records (reviewed) before Z can be a learner control','a stepwise (orbital-by-orbital) domain state for a constructor']},reasons:ecReasons});
  add('practice.simulation.8.06.planned','beta1',{family:'electron-configuration',domainModule:null,learnerControllableInputs:b1['practice.simulation.8.06.planned']?.controls??[],inputDomain:'values compared with the config targetState (element, configuration)',
    invalidInputBehaviour:'legacy form feedback (P2.1)',contentDefinesParameters:true,newChemistryRequired:{required:true,what:['as 11.01']},
    reasons:['NO_COMPUTED_ENGINE_IN_CURRENT_RUNTIME: beta1 compares the config targetState',...ecReasons.slice(0,2)]});

  // ---------------------------------------------------------------- calculations, validators, trainers (secondary audit)
  const calc=(id:string,module:string,what:string)=>add(id,'beta3-advanced',{family:'calculation',domainModule:module,learnerControllableInputs:[],inputDomain:`config values (${what}); the learner types the result with a unit`,
    invalidInputBehaviour:'CalculationEngine step validator (value + unit + tolerance)',contentDefinesParameters:true,
    reasons:['ANSWER_VALIDATOR_ONLY: type the final value → the engine says correct/wrong','CALCULATION_INTENT: changing the inputs and seeing the computed value would replace the calculation the curriculum asks for (F8)','TASK_SEMANTICS_NOT_IN_CONTENT: an exploration task (which input to vary, what to predict) is not defined by content (F5)']});
  calc('practice.calculation.11.06.planned','src/domain/chemistry/gas-laws.ts (totalGasMoles)','mixture moles');
  calc('practice.calculation.11.08.planned','src/domain/chemistry/gas-laws.ts (idealGasPressure)','n, T, V');
  calc('practice.calculation.11.14.planned','src/domain/chemistry/stoichiometry.ts (molarity, normality)','n, V, equivalent factor');
  calc('practice.calculation.11.22.planned','src/domain/chemistry/faraday-model.ts (faradayMass)','M, I, t, z');
  add('practice.simulation.11.03.planned','beta3-advanced',{family:'nuclear-equation',domainModule:'src/domain/chemistry/nuclear-equation.ts (validateNuclearEquation)',learnerControllableInputs:['conserved: yes/no'],
    inputDomain:'one content-defined equation (U-238 → Th-234 + α); the learner judges conservation',distinctReachableOutcomes:['true','false'],invalidInputBehaviour:'boolean choice (P2.1)',contentDefinesParameters:true,
    reasons:['ANSWER_VALIDATOR_ONLY: the engine returns one boolean for one fixed equation','DOMAIN_TRUTH_WOULD_MOVE_TO_UI: a balancing constructor needs ΣA/ΣZ state the engine does not return (F4)','TASK_SEMANTICS_NOT_IN_CONTENT: which particle is unknown in a balancing task is not defined by content (F5)']});
  add('practice.trainer.11.19.planned','beta3-advanced',{family:'redox-balancer',domainModule:'src/domain/chemistry/redox-balancer.ts (balanceRedox)',learnerControllableInputs:['typed balanced equation'],inputDomain:'one content-defined half-reaction set (acidic medium)',
    invalidInputBehaviour:'equation comparison with the balancer output',contentDefinesParameters:true,reasons:['ANSWER_VALIDATOR_ONLY: type the balanced equation → correct/wrong (trainer intent)']});
  add('practice.simulation.11.17.planned','beta3-advanced',{family:'dynamic-equilibrium',domainModule:null,learnerControllableInputs:['equilibrium: yes/no'],inputDomain:'two config rates compared inline in the runtime (|v₁ − v₂| < 1e-12); no rate model',
    distinctReachableOutcomes:['true','false'],invalidInputBehaviour:'boolean choice (P2.1)',contentDefinesParameters:true,newChemistryRequired:{required:true,what:['a forward/reverse rate model over time']},
    reasons:['NO_COMPUTED_ENGINE: the runtime compares two config numbers; there is no dynamic-equilibrium model','NEW_CHEMISTRY_REQUIRED: a rate-vs-time model would have to be authored and reviewed']});
  for(const [id,source] of [['practice.experiment.11.2','beta3-advanced'],['practice.experiment.9.10','beta2-advanced']] as const)
    add(id,source,{family:'electrolysis',domainModule:'src/domain/chemistry/electrolysis-model.ts',learnerControllableInputs:['procedure clicks'],inputDomain:`${d.electrolysisRaw.records?.length??0} modeled electrolysis record(s)`,
      distinctReachableOutcomes:[`${d.electrolysisRaw.records?.length??0} record`],invalidInputBehaviour:'unmodeled query → ELECTROLYSIS_NOT_MODELED',contentDefinesParameters:true,blackSwan:{pass:false,evidence:'one modeled record → one outcome'},
      reasons:['BLACK_SWAN_FAIL: one modeled record','OUT_OF_SCOPE_P26: expanding electrolysis model data is excluded (human chemistry work)']});
  for(const [id,source] of [['practice.trainer.11.10.planned','beta3-advanced'],['practice.trainer.9.05.planned','beta2-advanced']] as const)
    add(id,source,{family:'ionic-equation',domainModule:'src/domain/chemistry/ionic-engine.ts (netIonicEquation)',learnerControllableInputs:['typed net ionic equation'],inputDomain:'one content-defined reaction',
      invalidInputBehaviour:'equation comparison with IonicEngine',contentDefinesParameters:true,reasons:['ANSWER_VALIDATOR_ONLY: trainer — type the equation → correct/wrong (also audited in P2.5)']});
  for(const id of ['practice.simulation.11.02.planned','practice.simulation.11.04.planned','practice.simulation.11.09.planned','practice.simulation.11.12.planned'])
    add(id,'beta3-advanced',{family:'bounded-choice',domainModule:null,inputDomain:`config value "expected" (${JSON.stringify(b3[id].expected)})`,invalidInputBehaviour:'comparison with the config value',contentDefinesParameters:true,
      reasons:['NO_COMPUTED_ENGINE: the expected answer is a config value, not computed by a domain model']});
  for(const [id,slice,module] of [['practice.calculation.7.5','slice.7.12.relative-mass','src/domain/chemistry/formula-parser.ts'],['practice.trainer.7.4','slice.7.11.valency-formula','src/domain/chemistry/formula-parser.ts']] as const)
    add(id,'reference-slices',{family:'formula',domainModule:`${module} (${slice})`,learnerControllableInputs:['typed formula / value'],inputDomain:`reference slice ${ref[id]?.sliceId}`,invalidInputBehaviour:'parser error → feedback',contentDefinesParameters:true,
      reasons:['ANSWER_VALIDATOR_ONLY: type the formula/value → the parser/engine says correct/wrong']});
  for(const id of ['practice.simulation.11.11.planned','practice.experiment.9.14'])
    add(id,id.includes('11.11')?'beta3-advanced':'beta2-advanced',{family:'hydrolysis',domainModule:'src/domain/chemistry/hydrolysis-model.ts via hydrolysis-trial.ts',learnerControllableInputs:['salt','predicted medium'],inputDomain:'modeled salts',
      rendererReuse:'hydrolysis-medium@1.0.0 (P1.5)',evidenceSemantics:'hydrolysis-prediction answers + construction (P1.5)',blackSwan:{pass:true,evidence:'reports/reference-renderer-hydrolysis.json'}});

  // ---------------------------------------------------------------- repository scan: no candidate hidden
  const listed=new Set(rows.map(r=>r.activityId));
  for(const [source,configs] of [['beta1',b1],['beta2-safe',b2s],['beta3-safe',b3s]] as const) for(const [id,c] of Object.entries(configs as Record<string,Json>)){
    if(listed.has(id)||!['simulation','calculation'].includes(c?.type)) continue;
    add(id,source,{family:'config-target',domainModule:null,inputDomain:c.type==='calculation'?'config step values (value/unit/tolerance)':'values compared with the config targetState',invalidInputBehaviour:'legacy form feedback (P2.1)',contentDefinesParameters:true,
      reasons:['NO_COMPUTED_ENGINE: the runtime compares the learner input with a config value; no domain model computes a state']});
  }
  for(const [id,c] of Object.entries(org as Record<string,Json>)){
    if(listed.has(id)) continue;
    add(id,'beta2-organic',{family:'organic-knowledge',domainModule:'src/domain/chemistry/organic-knowledge.ts (record lookup)',inputDomain:`organic knowledge records (${c.capability})`,invalidInputBehaviour:'closed option set (P2.1)',contentDefinesParameters:true,
      status:'OUT_OF_FAMILY',reasons:['RECORD_BASED_NOT_COMPUTED: organic answers are looked up in a reviewed record set, not computed; outside the P2.6 computed-engine family']});
  }
  rows.sort((a,b)=>a.activityId.localeCompare(b.activityId));
  const by=(s:Row['status'])=>rows.filter(r=>r.status===s).map(r=>r.activityId);
  return {
    schema:'kimyolab.computed-model-interaction-audit.v1',
    semantics:'Every activity whose route reaches (or whose family claims) a computed chemistry/mathematics engine, plus every config-target simulation/calculation and every record-based organic activity, so no candidate is hidden. Eligible only when F1–F8 all hold: the learner controls a meaningful domain parameter; ≥2 valid choices reach different domain results; the result comes from the existing engine; the UI holds no answer logic; content already defines the task; unsupported input fails closed; the real browser path reaches success; the curriculum intent is unchanged. "type final answer → engine says correct/wrong" is never model-based.',
    rule:{F1:'learner controls a meaningful domain parameter',F2:'≥2 valid learner choices → meaningfully different model results (black-swan)',F3:'result from the existing domain engine',F4:'no chemistry/maths answer logic in the UI',F5:'content already defines the task semantics',F6:'unsupported input fails closed',F7:'real browser path reaches success',F8:'pedagogically equivalent to the curriculum intent'},
    totals:{candidates:rows.length,converted:by('CONVERTED').length,eligibleNotConverted:by('ELIGIBLE_NOT_CONVERTED').length,blocked:by('BLOCKED').length,notEligible:by('NOT_ELIGIBLE').length,alreadyModelBased:by('ALREADY_MODEL_BASED').length,outOfFamily:by('OUT_OF_FAMILY').length},
    converted:by('CONVERTED'),blocked:by('BLOCKED'),
    candidates:rows,
  };
}

/** Learner bundle measured on the committed build output (deterministic: raw bytes, no compression level dependency). */
export function bundle(root:string){
  const files:string[]=[];
  const walk=(p:string)=>{ for(const e of fs.readdirSync(path.join(root,p),{withFileTypes:true})){ const rel=`${p}/${e.name}`; if(e.isDirectory()) walk(rel); else if(rel.endsWith('.js')) files.push(rel); } };
  walk('public/app-preview');
  const size=(f:string)=>fs.statSync(path.join(root,f)).size;
  const renderers=files.filter(f=>f.includes('/renderers/'));
  return {learnerModules:files.length,learnerModuleBytes:files.reduce((n,f)=>n+size(f),0),rendererModules:renderers.length,rendererBytes:renderers.reduce((n,f)=>n+size(f),0),
    standaloneBytes:size('dist-standalone/KimyoLab_standalone.html')};
}

export function buildComputedModelExpansion(root:string,audit=buildComputedModelAudit(root)){
  const baseline=read(root,'reports/learning-depth-baseline.json');
  const progress=read(root,'reports/project-progress.json');
  const mb=baseline.activities.filter((a:Json)=>a.depth==='MODEL_BASED');
  const units=new Set(mb.flatMap((a:Json)=>a.learningUnits));
  const d=chemistry(root);
  const now=bundle(root), before=P25_BASELINE.bundle;
  const parity=exists(root,'reports/host-parity.json')?read(root,'reports/host-parity.json'):null;
  const cond=read(root,'reports/reference-renderer-condition-prediction.json');
  const cap=RENDERER_CATALOG.find(c=>c.id==='condition-prediction')!;
  const decisions=['release-decisions','pilot-signoffs','chemistry-reviews','assessment-reviews','chemistry-candidate-reviews'].reduce((n,f)=>n+(read(root,`content-src/${f}.json`).records?.length??0),0);
  const reasonCodes:Record<string,number>={};
  for(const c of audit.candidates) for(const r of c.reasons){ const k=r.split(':')[0]!; reasonCodes[k]=(reasonCodes[k]??0)+1; }
  const recordsAdded=Object.entries(d.counts).reduce((n,[k,v])=>n+Math.max(0,(v as number)-((P25_BASELINE.chemistryRecords as any)[k]??0)),0);
  const catalog=read(root,'content-src/locales/uz-latn/learner-interaction.json');
  return {
    schema:'kimyolab.computed-model-interaction-expansion.v1',
    semantics:'Facts only. Eligibility comes from reports/computed-model-interaction-audit.json (F1–F8); conversions are the eligible activities whose route was changed; every number is computed from the repository.',
    totalCandidates:audit.totals.candidates,
    eligible:audit.candidates.filter((c:Row)=>c.eligible).map((c:Row)=>c.activityId),
    converted:audit.converted,
    blocked:audit.candidates.filter((c:Row)=>c.status==='BLOCKED').map((c:Row)=>({activityId:c.activityId,reasons:c.reasons})),
    notEligible:audit.candidates.filter((c:Row)=>c.status==='NOT_ELIGIBLE').length,
    outOfFamily:audit.totals.outOfFamily,alreadyModelBased:audit.totals.alreadyModelBased,
    reasons:Object.fromEntries(Object.entries(reasonCodes).sort()),
    modelBasedActivities:{before:P25_BASELINE.modelBasedActivities,after:mb.length},
    modelBasedUnits:{before:P25_BASELINE.modelBasedUnits,after:units.size,total:baseline.learningUnits.length},
    progress:{before:{foundation:P25_BASELINE.foundation,learningProduct:P25_BASELINE.learningProduct,overall:P25_BASELINE.overall},after:{foundation:progress.foundationProgress.percent,learningProduct:progress.learningProductProgress.percent,overall:progress.overallManagementEstimate.percent},formulaChanged:false,cause:'modelBasedInteraction component only (MODEL_BASED units); no governance input moved'},
    perActivityBlackSwan:(cond.activities??[]).map((a:Json)=>({activityId:a.activityId,kind:a.kind,pass:a.status==='PASS',conditions:a.conditions,distinctOutcomes:a.distinctOutcomes,
      pathA:{condition:a.probes[0]?.condition,outcome:a.probes[0]?.engineOutcome},pathB:{condition:a.probes.find((p:Json)=>p.engineOutcome!==a.probes[0]?.engineOutcome)?.condition??null,outcome:a.probes.find((p:Json)=>p.engineOutcome!==a.probes[0]?.engineOutcome)?.engineOutcome??null},
      invalidPath:{failsClosed:a.checks.unmodeledFailsClosed&&a.checks.outcomeOutsideModelRejected},checks:a.checks})),
    versioning:{rule:'evaluation semantics changed (one-field answer → prediction trial): config version 1.0.0 → 2.0.0, new evidence ids (<id>.condition.trial.<n>, <id>.condition) and targetIds (<model>-<condition>-trial); old evidence is never the same scoring context',activities:audit.converted},
    bundleImpact:{method:'raw bytes of the committed learner modules (public/app-preview/**/*.js) and of the standalone artifact',before,after:now,
      delta:{learnerModules:now.learnerModules-before.learnerModules,learnerModuleBytes:now.learnerModuleBytes-before.learnerModuleBytes,rendererBytes:now.rendererBytes-before.rendererBytes,standaloneBytes:now.standaloneBytes-before.standaloneBytes},
      dependencies:'none added (DOM + CSS only; no canvas/WebGL/chart library)'},
    accessibility:{declared:cap.accessibility,automated:['tests/e2e/renderer-condition.spec.mjs (keyboard-only, aria-live text, ✓/✗ text, reduced motion, 375 px reflow, retry)','tests/e2e/host-scenarios.mjs (portal + standalone)'],
      result:'enforced by npm run verify (e2e step): a failing spec fails the build',humanReview:'pending — automated tests do not replace a human accessibility review'},
    hostParity:parity?{status:parity.summary.status,scenarios:parity.summary.scenarios,pass:parity.summary.pass,converted:['manganese-9.23','equilibrium-11.18','manganese-11.20'].map(id=>({id,status:parity.scenarios.find((s:Json)=>s.id===id)?.status??'MISSING'}))}:null,
    newChemistryRecords:recordsAdded,chemistryRecordCounts:d.counts,
    newDisplayText:{catalog:'content-src/locales/uz-latn/learner-interaction.json',reviewStatus:catalog.reviewStatus,keys:Object.keys(catalog.labels).filter(k=>k.startsWith('ui.cond-')||k.startsWith('answer.equilibrium-perturbation.')||k.startsWith('answer.equilibrium-system.')).sort(),
      note:'display translations of existing model ids and renderer UI text (review pending); the haber system label restates the equation already in the equilibrium record explanation'},
    translationDebt:['equilibrium record explanations and manganese observations are English-only and are not shown to learners; only structured results (shift label, product formula) are displayed'],
    humanDecisionsCreated:decisions,
  };
}
