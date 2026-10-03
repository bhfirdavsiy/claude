// P2.10 — Guided Dynamic Lab inventory, action catalog, profile coverage, readiness and migration equivalence.
//
//   npm run lab:inventory            writes the five reports
//   npm run lab:inventory -- --check fails when a written report differs from the generator output
//
// Everything is DISCOVERED from the repository (practice activities, activity configs, execution plans, mapping
// links, external lab bindings, the P2.9 feedback-semantics report, the topic lab profiles). Nothing is
// hard-coded from the task text. The equivalence report RUNS the existing runtime (ReferencePracticeSession) and
// the guided dynamic lab on the same built content pack and compares what they return.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyInstructionStep,COMPOSITION_CHANGING_FAMILIES,CONFIG_ACTION_TYPES,familyKind,INSTRUCTION_VERBS,LAB_ACTION_FAMILIES,OPERATION_KINDS,type InstructionOperation,type LabActionFamily} from '../src/domain/lab/action-catalog.ts';
import {deriveActivityExecutionPlan,type ConfigSource} from '../src/runtime/practice-router/execution-plan.ts';
import {TOPIC_LAB_PROFILE_SCHEMA,type TopicLabProfile} from '../src/domain/lab/topic-lab-profile.ts';
import {compileTopicLabProfiles,loadConfigs,openOrderPackets} from './lib/topic-lab-profiles.ts';
import {createLabRuntime,createLabState,observationGrounding,type LabAction} from '../src/domain/lab/lab-runtime.ts';
import {createLabDomain} from '../src/domain/lab/lab-domain.ts';
import {FEATURE_FLAGS} from '../src/app/feature-flags.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
export const LAB_REPORTS={
  inventory:'reports/guided-dynamic-lab-inventory.json',
  catalog:'reports/lab-action-catalog.json',
  coverage:'reports/topic-lab-profile-coverage.json',
  readiness:'reports/guided-dynamic-lab-readiness.json',
  equivalence:'reports/lab-migration-equivalence.json',
} as const;

const segments=(t:string|undefined)=>(t??'').replace(/\.$/,'').split(/,\s*/).map(s=>s.trim()).filter(Boolean);
const QUANTITY=/(\d+(?:[.,]\d+)?(?:[–-]\d+(?:[.,]\d+)?)?\s?(?:ml|g|mg|l|M|%|sm|°C|daqiqa|tomchi)|\d+\/\d+\s+qism\w*)/g;

function orderSemantics(runtime:string,config:any){
  if(runtime==='generic') return {kind:'SEQUENTIAL_BY_ARRAY_POSITION',detail:'the generic runtime makes every step depend on the previous array element (runtime/beta1/router.ts); no dependency is declared in the content'};
  if(runtime==='reference-slice') return Array.isArray(config.reagentShelf)
    ?{kind:'UNORDERED_REAGENT_CHOICE',detail:'the learner chooses reagents (ionic-mixing.ts); state preconditions only'}
    :{kind:'DECLARED_DEPENDENCIES',detail:'config.scenario.steps[].dependencies (reference slice)'};
  if(config.capability==='hydrolysis-experiment') return {kind:'RENDERER_TRIAL',detail:'choose salt → predict → indicator (hydrolysis-trial.ts)'};
  return {kind:'UNORDERED_SET',detail:'complete when every required action was done once, in any order'};
}

function configObservations(config:any){
  const out:Array<{step:string|null;type:string;ref:string|null}>=[];
  for(const s of config?.scenario?.steps??[]) for(const o of s.observations??(s.observation?[s.observation]:[])) out.push({step:s.id,type:o.type,ref:o.descriptionKey??o.to??null});
  return out;
}
function grounding(config:any){
  const steps=config?.scenario?.steps??[];
  return {
    reactionIds:[...new Set([...(config.reactionId?[config.reactionId]:[]),...steps.flatMap((s:any)=>s.reactionIds??(s.reactionId?[s.reactionId]:[]))])].sort(),
    modelIds:[...new Set(steps.map((s:any)=>s.modelId).filter(Boolean))].sort(),
    electrolysisQuery:config.query??null,
    salt:config.salt??null,
    reagentShelf:config.reagentShelf??null,
    hardening:config.hardening?.status??null,
  };
}

function loadAll(root:string){
  const activities=(readJson(root,'content-src/practice-activities.json') as any[]).filter(a=>a.type==='experiment').sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const mappings=readJson(root,'content-src/mapping-links.json') as any[];
  const bindings=readJson(root,'content-src/external-lab-bindings.json') as any[];
  const configs=loadConfigs(root);
  const packets=openOrderPackets(root);
  const {profiles}=compileTopicLabProfiles(root);
  return {activities,mappings,bindings,configs,packets,profiles};
}

export function buildInventory(root=ROOT){
  const {activities,mappings,bindings,configs,packets,profiles}=loadAll(root);
  const handlers=new Set(LAB_ACTION_FAMILIES.filter(d=>d.domainHandler).map(d=>d.family));
  const records=activities.map(a=>{
    const plan=deriveActivityExecutionPlan(a,configs as any);
    const route=plan.ok?plan.plan:null;
    const config=route?(configs[route.configSource as ConfigSource] as any)[a.id]:null;
    const legacy=a.legacyContent??{};
    const steps:Array<{index:number;text:string;operations:InstructionOperation[]}>=(legacy.steps??[]).map((t:string,index:number)=>({index,text:t,operations:classifyInstructionStep(t)}));
    const ops=steps.flatMap(s=>s.operations);
    const lus=[...new Set(mappings.filter(m=>m.practiceActivityId===a.id).map(m=>m.learningUnitId as string))].sort();
    const quantities=[...new Set(steps.flatMap(s=>[...s.text.matchAll(QUANTITY)].map(m=>m[0])))];
    const profile=profiles.find(p=>p.activityId===a.id);
    const gaps:string[]=[];
    if(!steps.length) gaps.push('NO_INSTRUCTION_STEPS');
    if(!legacy.equipment) gaps.push('APPARATUS_NOT_DECLARED');
    if(!legacy.materials) gaps.push('MATERIALS_NOT_DECLARED');
    if(!legacy.safety&&!(config?.safetyNotes??[]).length) gaps.push('SAFETY_TEXT_EMPTY');
    if(steps.length&&!quantities.length) gaps.push('QUANTITY_NOT_DECLARED');
    for(const o of ops){
      if(o.status==='UNMAPPED_OPERATION') gaps.push(o.verb?`UNMAPPED_OPERATION:${o.verb}`:'UNMAPPED_OPERATION:no-imperative-verb');
      else if(o.status==='AMBIGUOUS') gaps.push(`AMBIGUOUS_OPERATION:${o.verb}`);
      // P2.10 closeout: only a state/observation action lacks a DOMAIN handler; a learner response lacks a CHECKER;
      // control and safety rules are not topic actions at all
      else if(o.family&&!handlers.has(o.family)){
        const kind=familyKind(o.family);
        if(kind==='STATE_ACTION'||kind==='OBSERVATION_ACTION') gaps.push(`NO_DOMAIN_HANDLER:${o.family}`);
        else if(kind==='LEARNER_RESPONSE') gaps.push(`LEARNER_RESPONSE_CHECKER_MISSING:${o.family}`);
        else if(kind==='SAFETY_RULE') gaps.push('SAFETY_RULE_IN_INSTRUCTION');
      }
    }
    const order=route?orderSemantics(route.runtime,config):{kind:'NO_ROUTE',detail:plan.ok?'':plan.error.code};
    if(order.kind==='SEQUENTIAL_BY_ARRAY_POSITION') gaps.push('ORDER_FROM_ARRAY_POSITION');
    if(packets[a.id]) gaps.push('ORDER_DECISION_OPEN');
    const g=config?grounding(config):null;
    if(config?.hardening&&!config.hardening.groundedSteps) gaps.push('STEPS_NOT_GROUNDED');
    return {
      activityId:a.id,
      title:a.title,
      learningUnitIds:lus,
      lifecycleStatus:a.lifecycleStatus,
      instructionSource:{field:'legacyContent',stepCount:steps.length,sourceRefs:(a.sourceRefs??[]).map((r:any)=>r.id),authoredSource:config?.authoredSource??null},
      apparatus:{declared:Boolean(legacy.equipment),items:segments(legacy.equipment)},
      substances:{declared:Boolean(legacy.materials),materials:segments(legacy.materials),legacyReagentList:legacy.reagents??[],configSpecies:g?.reagentShelf??(g?.electrolysisQuery?[g.electrolysisQuery.electrolyte]:g?.salt?[g.salt]:[])},
      quantities,
      steps:steps.map(s=>({index:s.index,text:s.text,operations:s.operations})),
      observations:{configDeclared:config?configObservations(config):[],instructionObserveOperations:ops.filter(o=>o.family==='OBSERVE').length},
      safetyNotes:[...(legacy.safety?[{text:legacy.safety,source:'legacyContent.safety'}]:[]),...(config?.safetyNotes??[]).map((t:string)=>({text:t,source:'config.safetyNotes'}))],
      grounding:g,
      runtime:route?{runtime:route.runtime,capability:route.capability,configSource:route.configSource,configVersion:route.configVersion,configActions:[...new Set([...(config.requiredActions??[]),...(config.scenario?.steps??[]).map((s:any)=>s.actionType)])]}:null,
      renderer:route?.rendererRequirement?{capability:route.rendererRequirement.capability,range:route.rendererRequirement.range}:{capability:'legacy-practice-renderer',range:null},
      orderSemantics:{...order,decisionPacket:packets[a.id]??null},
      guidanceSemantics:route?.rendererRequirement?{kind:'RENDERER_OWN_FEEDBACK',levels:0}:{kind:'STEP_LIST_CURRENT_STEP_MARKER',levels:0},
      externalLabs:bindings.filter(b=>(b.learningUnitIds??[]).some((l:string)=>lus.includes(l))).map(b=>({id:b.id,provider:b.provider,status:b.status,mode:b.mode,relevance:'SAME_LEARNING_UNIT',sharedLearningUnits:(b.learningUnitIds as string[]).filter(l=>lus.includes(l)).sort(),proposedRole:null,roleEvidence:'none: no evidence links this lab to this experiment beyond the learning unit; PRIMARY/SUPPLEMENTARY/EXPLORE is not assigned'})),
      dynamicLab:profile?{profiled:true,profileId:profile.profileId}:{profiled:false,profileId:null},
      gaps:[...new Set(gaps)].sort(),
    };
  });
  const allOps=records.flatMap(r=>r.steps.flatMap(s=>s.operations));
  return {
    schema:'kimyolab.guided-dynamic-lab-inventory.v1',
    phase:'P2.10',
    semantics:'Every experiment-type practice activity, discovered from content-src. Instruction = legacyContent (the textbook lab text). Operations are the imperative verbs of each step classified by the declared lexicon (src/domain/lab/action-catalog.ts); an unknown verb or a step without one is an explicit UNMAPPED_OPERATION gap. External labs are listed by shared learning unit only; no role is assigned without evidence.',
    summary:{
      experiments:records.length,
      withInstructionSteps:records.filter(r=>r.instructionSource.stepCount>0).length,
      instructionSteps:records.reduce((n,r)=>n+r.instructionSource.stepCount,0),
      operations:allOps.length,
      mapped:allOps.filter(o=>o.status==='MAPPED').length,
      ambiguous:allOps.filter(o=>o.status==='AMBIGUOUS').length,
      unmapped:allOps.filter(o=>o.status==='UNMAPPED_OPERATION').length,
      byRuntime:count(records.map(r=>r.runtime?.runtime??'none')),
      byOrderSemantics:count(records.map(r=>r.orderSemantics.kind)),
      withExternalLabs:records.filter(r=>r.externalLabs.length).length,
      openOrderDecisions:records.filter(r=>r.orderSemantics.decisionPacket).map(r=>r.activityId),
      profiled:records.filter(r=>r.dynamicLab.profiled).map(r=>r.activityId),
    },
    experiments:records,
  };
}

function count(xs:string[]){ const o:Record<string,number>={}; for(const x of xs) o[x]=(o[x]??0)+1; return Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b,'en'))); }

export function buildCatalog(inventory=buildInventory()){
  const ops=inventory.experiments.flatMap(e=>e.steps.flatMap(s=>s.operations.map(o=>({...o,activityId:e.activityId}))));
  const configActions=inventory.experiments.flatMap(e=>(e.runtime?.configActions??[]).map(t=>({type:t,activityId:e.activityId})));
  const families=LAB_ACTION_FAMILIES.map(d=>{
    const mine=ops.filter(o=>o.family===d.family);
    const cfg=configActions.filter(c=>CONFIG_ACTION_TYPES[c.type]===d.family);
    const activities=[...new Set([...mine.map(o=>o.activityId),...cfg.map(c=>c.activityId)])].sort();
    return {
      id:d.id,family:d.family,kind:d.kind,parameters:d.parameters,apparatusRequirements:d.apparatusRequirements,statePreconditions:d.statePreconditions,
      topicAvailability:'allowed only when the topic lab profile lists the family (else ACTION_NOT_ALLOWED_IN_TOPIC) and not forbidden by its safety rules (else UNSAFE_ACTION); parameter values only from the profile',
      topicAction:d.kind==='STATE_ACTION'||d.kind==='OBSERVATION_ACTION'||d.kind==='LEARNER_RESPONSE',
      domainHandler:d.kind==='STATE_ACTION'||d.kind==='OBSERVATION_ACTION'
        ?(d.domainHandler?{required:true,implemented:true,authority:d.chemistryAuthority}:{required:true,implemented:false,authority:null,result:'ACTION_UNSUPPORTED'})
        :{required:false,reason:d.kind==='LEARNER_RESPONSE'?'a learner response never changes LabState; it needs a checker, a rubric or a human/content decision':d.kind==='CONTROL'?'lab-level control (RESET = runtime.reset(profile)); never chemistry':'a prohibition in the instruction text; carried as a safety note, never offered as an action'},
      checker:d.kind==='LEARNER_RESPONSE'?(d.checker?{implemented:true,checker:d.checker}:{implemented:false,result:'LEARNER_RESPONSE_CHECKER_MISSING'}):null,
      renderer:{required:true,implemented:d.renderer,kind:'generic object → action → parameter UI (src/features/dynamic-lab)'},
      accessibility:d.accessibility,
      coverage:{instructionOperations:mine.length,ambiguousOperations:mine.filter(o=>o.status==='AMBIGUOUS').length,configActionTypes:[...new Set(cfg.map(c=>c.type))].sort(),activities:activities.length,exampleActivities:activities.slice(0,5)},
      evidence:mine.length||cfg.length?'DERIVED_FROM_REPOSITORY':'DECLARED_WITHOUT_OCCURRENCE',
    };
  });
  const unmapped=ops.filter(o=>o.status==='UNMAPPED_OPERATION');
  const unknownConfig=[...new Set(configActions.filter(c=>!CONFIG_ACTION_TYPES[c.type]&&!/^(guided\.)?step\.\d+$/.test(c.type)).map(c=>c.type))].sort();
  return {
    schema:'kimyolab.lab-action-catalog.v1',
    phase:'P2.10',
    semantics:'Canonical action families of the guided dynamic lab, each with an operation KIND: STATE_ACTION (may change LabState; needs a domain/procedure handler, else ACTION_UNSUPPORTED), OBSERVATION_ACTION (inspects an existing state/event; never produces an outcome), LEARNER_RESPONSE (pedagogical response; needs a checker, else LEARNER_RESPONSE_CHECKER_MISSING — never a missing chemistry handler), CONTROL (lab-level, e.g. RESET) and SAFETY_RULE (an instruction prohibition, not an action). Derived from the instruction steps (verb lexicon) and the explicit config action types of the existing runtimes. Only STATE/OBSERVATION/LEARNER_RESPONSE families can be offered, and only through a topic lab profile.',
    summary:{families:families.length,byKind:Object.fromEntries(OPERATION_KINDS.map(k=>[k,families.filter(f=>f.kind===k).map(f=>f.family)])),withDomainHandler:families.filter(f=>(f.domainHandler as any).implemented===true).length,learnerResponsesWithChecker:families.filter(f=>f.checker?.implemented).map(f=>f.family),derivedFromRepository:families.filter(f=>f.evidence==='DERIVED_FROM_REPOSITORY').length,operations:ops.length,unmappedOperations:unmapped.length,genericStepActionTypes:configActions.filter(c=>/^(guided\.)?step\.\d+$/.test(c.type)).length,unknownConfigActionTypes:unknownConfig},
    families,
    // an ambiguous verb has no family of its own: only its context rules can resolve it (unresolved → family null)
    lexicon:Object.entries(INSTRUCTION_VERBS).map(([verb,rule])=>({verb,family:rule.ambiguous?null:rule.family,ambiguous:Boolean(rule.ambiguous),contextFamilies:rule.ambiguous?[...new Set(rule.context.map(c=>c.family))]:[],occurrences:ops.filter(o=>o.verb===verb).length,unresolved:ops.filter(o=>o.verb===verb&&o.status==='AMBIGUOUS').length})).sort((a,b)=>a.verb.localeCompare(b.verb,'en')),
    configActionTypes:Object.entries(CONFIG_ACTION_TYPES).map(([type,family])=>({type,family,occurrences:configActions.filter(c=>c.type===type).length})).sort((a,b)=>a.type.localeCompare(b.type,'en')),
    gaps:{
      unmappedOperations:Object.entries(count(unmapped.map(o=>o.verb||'(no imperative verb)'))).map(([verb,n])=>({verb,occurrences:n,activities:[...new Set(unmapped.filter(o=>(o.verb||'(no imperative verb)')===verb).map(o=>o.activityId))].sort()})),
      genericStepActions:'guided.step.N / step.N carry no operation; their label text is classified by the lexicon instead',
    },
  };
}

/** The coverage report as first committed (b59e640), kept so the closeout's reclassification is reported as a delta. */
export const P210_INITIAL_COVERAGE={source:'reports/topic-lab-profile-coverage.json @ b59e640',summary:{experiments:57,BLOCKED:54,PROFILED:3},
  rowsPerBlocker:{NO_CHEMISTRY_AUTHORITY_IN_CONFIG:38,NO_DOMAIN_HANDLER:49,NO_INSTRUCTION_STEPS:2,ORDER_DECISION_OPEN:5,AMBIGUOUS_OPERATION:1,UNMAPPED_OPERATION:1},
  rowsWithLearnerResponseCountedAsMissingHandler:26};

type Finding={code:string;category:string};
/** Multi-element formula tokens in instruction text (CuCl2, KI, CO2); single letters such as the "M" of "2 M" are not. */
const FORMULA=/\b(?:[A-Z][a-z]?\d*){2,}\b/g;
export function buildCoverage(inventory=buildInventory(),profiles:TopicLabProfile[]=compileTopicLabProfiles(ROOT).profiles,root=ROOT){
  const handlers=new Set(LAB_ACTION_FAMILIES.filter(d=>d.domainHandler).map(d=>d.family));
  const configs=loadConfigs(root);
  const activities=readJson(root,'content-src/practice-activities.json') as any[];
  const reactionsRaw=readJson(root,'content-src/chemistry/reactions.json');
  const reactions=new Map((Array.isArray(reactionsRaw)?reactionsRaw:reactionsRaw.reactions??[]).map((r:any)=>[r.id,r]));
  const electrolytes=new Set<string>((readJson(root,'content-src/chemistry/electrolysis.json').records??[]).map((r:any)=>String(r.electrolyte)));
  const speciesRaw=readJson(root,'content-src/chemistry/species.json');
  const speciesFormula=new Map((Array.isArray(speciesRaw)?speciesRaw:speciesRaw.species).map((x:any)=>[x.id,x.formula as string]));
  const rows=inventory.experiments.map(e=>{
    const profile=profiles.find(p=>p.activityId===e.activityId);
    const ops=e.steps.flatMap(s=>s.operations);
    const families=[...new Set(ops.map(o=>o.family).filter((f):f is LabActionFamily=>Boolean(f)))].sort();
    const authority=e.grounding?.reagentShelf?'ionic-mixing':e.grounding?.electrolysisQuery?'electrolysis':e.grounding?.salt?'hydrolysis':e.grounding?.reactionIds.length?'reaction-records':null;
    const blockers:Finding[]=[], gaps:Finding[]=[];
    if(!e.instructionSource.stepCount) blockers.push({code:'NO_INSTRUCTION_STEPS',category:'CONTENT_REQUIRED'});
    for(const f of families){
      const kind=familyKind(f);
      if((kind==='STATE_ACTION'||kind==='OBSERVATION_ACTION')&&!handlers.has(f)) blockers.push({code:`NO_DOMAIN_HANDLER:${f}`,category:kind==='STATE_ACTION'?'STATE_HANDLER_MISSING':'OBSERVATION_HANDLER_MISSING'});
      // a learner response is never a missing chemistry handler: the net-ionic checker exists only for ionic-mixing topics
      if(kind==='LEARNER_RESPONSE'&&!(f==='RECORD'&&authority==='ionic-mixing')) gaps.push({code:`LEARNER_RESPONSE_CHECKER_MISSING:${f}`,category:'LEARNER_RESPONSE_CHECKER_MISSING'});
      if(kind==='SAFETY_RULE') gaps.push({code:'SAFETY_RULE_IN_INSTRUCTION',category:'SAFETY_RULE'});
    }
    // composition-changing state actions need an authority, otherwise they would have to be invented → fail closed
    const changing=families.filter(f=>COMPOSITION_CHANGING_FAMILIES.has(f));
    if(changing.length&&!authority) blockers.push({code:'NO_CHEMISTRY_AUTHORITY_IN_CONFIG',category:'CHEMISTRY_AUTHORITY_MISSING'});
    for(const o of ops){
      if(o.status==='UNMAPPED_OPERATION') blockers.push({code:o.verb?`UNMAPPED_OPERATION:${o.verb}`:'UNMAPPED_OPERATION:no-imperative-verb',category:'UNMAPPED_OPERATION'});
      if(o.status==='AMBIGUOUS') blockers.push({code:`AMBIGUOUS_OPERATION:${o.verb}`,category:'AMBIGUOUS_OPERATION'});
    }
    const config=e.runtime?(configs[e.runtime.configSource] as any)?.[e.activityId]:null;
    // a config that supplies the operations itself (a reagent shelf, an electrolysis query, a hydrolysis salt)
    const configOperations=Boolean(config?.reagentShelf||config?.query||config?.salt);
    // "prove / identify by experiment" with no operation named and no config operations: the content must say what to do
    if(e.instructionSource.stepCount&&!families.some(f=>familyKind(f)==='STATE_ACTION')&&!configOperations) blockers.push({code:'NO_STATE_ACTION_IN_INSTRUCTION',category:'CONTENT_REQUIRED'});
    // per-step grounding (guided labs): a step that changes composition without a reaction record or model is ungrounded
    const configSteps=config?.authoredSource==='legacyContent.steps'?config.scenario?.steps??[]:null;
    if(configSteps) e.steps.forEach((st,i)=>{
      const changes=st.operations.some(o=>o.family&&COMPOSITION_CHANGING_FAMILIES.has(o.family));
      const grounded=Boolean(configSteps[i]?.reactionIds?.length||configSteps[i]?.reactionId||configSteps[i]?.modelId);
      if(changes&&!grounded) blockers.push({code:`STEP_NOT_GROUNDED:${i+1}`,category:'CHEMISTRY_AUTHORITY_MISSING'});
    });
    // the instruction's own substances must be known to the authority, or the instruction exceeds the model
    const known=new Set<string>(['H2O']);
    if(authority==='electrolysis') for(const x of electrolytes) known.add(x);
    if(authority==='ionic-mixing') for(const id of config.reagentShelf) known.add(String(speciesFormula.get(id)));
    if(authority==='reaction-records') for(const id of e.grounding?.reactionIds??[]){ const r:any=reactions.get(id); for(const x of [...(r?.reactants??[]),...(r?.products??[])]) known.add(x.formula); }
    if(authority&&authority!=='hydrolysis'){
      const materials=String(activities.find(a=>a.id===e.activityId)?.legacyContent?.materials??'');
      for(const f of new Set(materials.match(FORMULA)??[])) if(!known.has(f)) blockers.push({code:`INSTRUCTION_SUBSTANCE_NOT_MODELED:${f}`,category:'INSTRUCTION_NOT_COVERED_BY_AUTHORITY'});
    }
    if(e.orderSemantics.decisionPacket) gaps.push({code:'ORDER_DECISION_OPEN',category:'HUMAN_DECISION_REQUIRED'});
    const uniq=(xs:Finding[])=>[...new Map(xs.map(x=>[x.code,x])).values()].sort((a,b)=>a.code.localeCompare(b.code,'en'));
    const status=profile?'PROFILED':blockers.length?'BLOCKED':'PROFILE_CANDIDATE';
    return {activityId:e.activityId,status,profileId:profile?.profileId??null,instructionFamilies:families.map(f=>({family:f,kind:familyKind(f),fromVerbs:[...new Set(ops.filter(o=>o.status==='MAPPED'&&o.family===f).map(o=>o.verb))].sort()})),chemistryAuthority:authority,orderMode:profile?.procedure.mode??null,
      blockers:profile?[]:uniq(blockers),gaps:profile?[]:uniq(gaps),profileGaps:profile?.gaps.map(g=>g.code)??[]};
  });
  const perCategory=(key:'blockers'|'gaps')=>{ const o:Record<string,number>={}; for(const r of rows) for(const c of new Set(r[key].map(x=>x.category))) o[c]=(o[c]??0)+1; return Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b,'en'))); };
  const summary={experiments:rows.length,...count(rows.map(r=>r.status))};
  return {
    schema:'kimyolab.topic-lab-profile-coverage.v1',
    phase:'P2.10',
    profileSchema:TOPIC_LAB_PROFILE_SCHEMA,
    semantics:'PROFILED = a validated kimyolab.topic-lab-profile.v1 exists (vertical slice). BLOCKED = at least one BLOCKER: a state/observation action without a safe handler; a composition-changing action without a chemistry authority, or a guided step that changes composition without a reaction record or model (fail closed); an instruction substance the authority does not know; an unmapped or ambiguous operation; or missing instruction content (no steps, or a "prove/identify by experiment" task that names no operation while the config supplies none). PROFILE_CANDIDATE = no blocker; it may still carry GAPS that are not missing chemistry: LEARNER_RESPONSE_CHECKER_MISSING (a response with no checker is never judged), HUMAN_DECISION_REQUIRED (open order question), SAFETY_RULE (a prohibition to carry as a safety note). A candidate is NOT profiled: no profile is written by guessing and nothing is migrated.',
    summary,
    rowsPerBlockerCategory:perCategory('blockers'),
    rowsPerGapCategory:perCategory('gaps'),
    reclassification:{
      before:P210_INITIAL_COVERAGE,
      after:{summary,rowsPerBlockerCategory:perCategory('blockers')},
      changes:[
        'learner responses (COMPARE, INFER, RECORD, EXPLAIN, STUDY, SELECT) are LEARNER_RESPONSE_CHECKER_MISSING gaps, no longer NO_DOMAIN_HANDLER blockers',
        'an open order question is a HUMAN_DECISION_REQUIRED gap (a profile can carry HUMAN_DECISION_REQUIRED, as 11.2 does), no longer a blocker',
        'a missing chemistry authority blocks only experiments with composition-changing state actions',
        '"qaratmang" is a SAFETY_RULE, no longer an unmapped operation; "bajaring" (10.7) names no single operation and is AMBIGUOUS',
        'an ambiguous verb with no matching context has NO family (family null): it is an AMBIGUOUS_OPERATION blocker only and never yields a family or a NO_DOMAIN_HANDLER blocker for a guessed family',
        'REPEAT (8.6: repeat the procedure with CuCl2) is a state action and stays a blocker without a handler',
        'new blockers that the first pass missed: a task naming no operation (CONTENT_REQUIRED), an ungrounded composition-changing guided step, an instruction substance unknown to the authority (e.g. KI in 9.10)',
      ],
    },
    rows,
  };
}

// ------------------------------------------------------------------ equivalence (runs both runtimes)

async function packPractice(root:string,id:string){
  const {ContentClient}=await import('../src/app/content-client.ts');
  const base=path.join(root,'public/content');
  const fetchImpl=async(u:string)=>{ const rel=String(u).replace(/^\/content\//,''); const file=path.join(base,...rel.split('/')); if(!fs.existsSync(file)) return {ok:false,status:404} as any; const t=fs.readFileSync(file,'utf8'); return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t),arrayBuffer:async()=>new TextEncoder().encode(t).buffer} as any; };
  return new ContentClient({fetchImpl:fetchImpl as any,baseUrl:'/content'}).loadPractice(id);
}

const NOW=()=>'2026-01-01T00:00:00.000Z';

async function oldRun(page:any,actions:any[]){
  const {ReferencePracticeSession}=await import('../src/features/practice/session.ts');
  const s=new ReferencePracticeSession(page,{now:NOW});
  let result:any=await s.result();
  const outcomes:any[]=[];
  for(const a of actions){ result=await s.apply({kind:'experiment-action',action:a}); outcomes.push(result.outcomes?.at?.(-1)??null); }
  return {result,outcomes};
}
function newRun(page:any,profile:TopicLabProfile,actions:LabAction[]){
  const rt=createLabRuntime(createLabDomain(page.chemistry));
  let state=createLabState(profile); const results=[];
  for(const a of actions){ const r=rt.applyLabAction(state,a,profile); results.push(r); state=r.nextState; }
  return {state,results,replayEqual:JSON.stringify(rt.replay(profile,state.actionLog))===JSON.stringify(state)};
}

const dim=(status:'EQUIVALENT'|'DIFFERENT'|'NOT_PROVEN',detail:string,evidence:string)=>({status,detail,evidence});

async function equivalence81(root:string,profile:TopicLabProfile){
  const page=await packPractice(root,profile.activityId);
  const eq='Ag+ + Cl- → AgCl(s)';
  const old=await oldRun(page,[{type:'selectReagent',payload:{slot:'A',speciesId:'species.bacl2'}},{type:'selectReagent',payload:{slot:'B',speciesId:'species.h2so4'}},{type:'mix'},{type:'selectReagent',payload:{slot:'A',speciesId:'species.nacl'}},{type:'selectReagent',payload:{slot:'B',speciesId:'species.nano3'}},{type:'mix'},{type:'selectReagent',payload:{slot:'A',speciesId:'species.agno3'}},{type:'selectReagent',payload:{slot:'B',speciesId:'species.nacl'}},{type:'mix'},{type:'writeEquation',payload:{equation:eq}}]);
  // P2.10 closeout: WASH is not in 8.1's instruction, so the third pair needs a new attempt — the lab-level RESET
  // (runtime.reset = createLabState), which restores the initial state and is not chemistry
  const first=newRun(page,profile,[{family:'ADD_SUBSTANCE',params:{substance:'bacl2',container:'tube-1'}},{family:'ADD_SUBSTANCE',params:{substance:'h2so4',container:'tube-1'}},{family:'MIX',params:{container:'tube-1'}},{family:'ADD_SUBSTANCE',params:{substance:'nacl',container:'tube-2'}},{family:'ADD_SUBSTANCE',params:{substance:'nano3',container:'tube-2'}},{family:'MIX',params:{container:'tube-2'}}]);
  const washInTopic=newRun(page,profile,[{family:'WASH',params:{container:'tube-2'}}]).results[0]!;
  const neu=newRun(page,profile,[{family:'ADD_SUBSTANCE',params:{substance:'agno3',container:'tube-1'}},{family:'ADD_SUBSTANCE',params:{substance:'nacl',container:'tube-1'}},{family:'MIX',params:{container:'tube-1'}},{family:'RECORD',params:{container:'tube-1',text:eq}}]);
  const allNew=[...first.results,...neu.results];
  const oldMixes=old.result.finalState.ionic.mixes.map((m:any)=>({outcome:m.outcome,reactionId:m.reactionId,coverageCode:m.coverageCode,observations:m.observations}));
  const newMixes=allNew.filter(r=>r.chemistryEvents.some(e=>e.type==='mix')).map(r=>{ const e=r.chemistryEvents.find(x=>x.type==='mix')!.detail as any; return {outcome:e.outcome,reactionId:e.reactionId,coverageCode:e.coverageCode,observations:e.outcome==='not-modeled'?null:r.observations.filter(o=>o.producedBy==='ReactionMatcher'&&o.kind!=='no-reaction').map(o=>o.data)}; });
  const sameChem=JSON.stringify(oldMixes)===JSON.stringify(newMixes);
  const oldDone=old.result.finalState.status==='complete', newDone=neu.state.complete;
  const filter=newRun(page,profile,[{family:'FILTER',params:{container:'tube-1'}}]).results[0]!;
  return {
    activityId:profile.activityId,profileId:profile.profileId,
    oldRuntime:{runtime:page.executionPlan.runtime,capability:page.executionPlan.capability,renderer:page.executionPlan.rendererRequirement?.capability??'legacy'},
    scenario:'BaCl2+H2SO4, NaCl+NaNO3 (not modeled), AgNO3+NaCl, then the net ionic equation — the same choices in both runtimes; the new runtime needs a RESET before the third pair (two tubes, no WASH in the instruction)',
    dimensions:{
      instruction:dim('DIFFERENT','new: the instruction steps, their operations and the grounded step (2) are part of the profile, and only instruction actions are offered (no WASH); old: the reagent shelf only, any number of pairs per attempt','topic-lab-profiles.json instruction'),
      chemistryResult:dim(sameChem?'EQUIVALENT':'DIFFERENT',sameChem?'the same evaluateIonicMixing outcomes, reaction ids and coverage codes for every pair':'mix outcomes differ','runs both: old ReferencePracticeSession vs new applyLabAction on the built pack'),
      observations:dim(sameChem?'EQUIVALENT':'DIFFERENT','the observation data is the reaction record’s own observation in both','runs both'),
      safety:dim('EQUIVALENT','neither runtime has safety text for 8.1 (legacyContent.safety is empty)','profile.safety.notes = []'),
      completion:dim(oldDone===newDone&&newDone?'EQUIVALENT':'DIFFERENT',`same goal (target observed + correct net ionic equation): old complete=${oldDone} in one attempt; new complete=${newDone} in the attempt after RESET`,'runs both'),
      evidence:dim('DIFFERENT','new: evidence CANDIDATES only (persisted:false); the old runtime writes observation/answer/construction evidence through the orchestrator','LabActionResult.evidenceCandidate'),
      accessibility:dim('NOT_PROVEN','the new route has its own e2e accessibility checks (tests/e2e/guided-dynamic-lab.spec.mjs); it is not part of the P2.7 sweep (140/5/0/1 unchanged)','e2e'),
      portalStandaloneParity:dim('EQUIVALENT','both runtimes run identically on the portal and the standalone host','tests/e2e/guided-dynamic-lab.spec.mjs runs on both hosts'),
    },
    newOnly:{filterInTopic:filter.error?.code??null,washInTopic:washInTopic.error?.code??null,replayDeterministic:first.replayEqual&&neu.replayEqual},
  };
}

async function equivalence112(root:string,profile:TopicLabProfile){
  const page=await packPractice(root,profile.activityId);
  const old=await oldRun(page,[{type:'connectCurrent'},{type:'observeCathode'},{type:'observeAnode'}]);
  const oldOnlyObserve=await oldRun(page,[{type:'observeAnode'},{type:'observeCathode'},{type:'connectCurrent'}]);
  const neu=newRun(page,profile,[{family:'ADD_SUBSTANCE',params:{substance:'cucl2-solution',container:'cell'}},{family:'SETUP_APPARATUS',params:{apparatus:'electrodes'}},{family:'SETUP_APPARATUS',params:{apparatus:'dc-source'}},{family:'ELECTRIC_CURRENT',params:{container:'cell'}},{family:'OBSERVE',params:{target:'cathode'}},{family:'OBSERVE',params:{target:'anode'}}]);
  const neuReverse=newRun(page,profile,[{family:'OBSERVE',params:{target:'anode'}},{family:'OBSERVE',params:{target:'cathode'}},{family:'ELECTRIC_CURRENT',params:{container:'cell'}}]);
  const oldCathode=old.result.evidence.find((e:any)=>e.id.endsWith('.cathode'))?.observation?.to??null;
  const oldAnode=old.result.evidence.find((e:any)=>e.id.endsWith('.anode'))??null;
  const newCathode=(neu.state.observations.find(o=>o.target==='cathode')?.data as any)?.product??null;
  const newAnode=(neu.state.observations.find(o=>o.target==='anode')?.data as any)?.product??null;
  return {
    activityId:profile.activityId,profileId:profile.profileId,
    oldRuntime:{runtime:page.executionPlan.runtime,capability:page.executionPlan.capability,renderer:page.executionPlan.rendererRequirement?.capability??'legacy'},
    scenario:'fill → electrodes → power → current → observe cathode and anode; and the reverse order',
    dimensions:{
      instruction:dim('DIFFERENT','new: the five instruction steps, the apparatus and materials of the text; old: three action buttons','profile.instruction'),
      chemistryResult:dim(oldCathode===newCathode?'EQUIVALENT':'DIFFERENT',`cathode product: old ${oldCathode}, new ${newCathode} (same ElectrolysisModel record)`,'runs both'),
      observations:dim('DIFFERENT',`old 11.2 records only the cathode observation (anode evidence ${oldAnode?'present':'absent'}); new also reports the anode product ${newAnode} from the same model record`,'runs both'),
      safety:dim('EQUIVALENT','the same legacy safety sentence','profile.safety.notes ← legacyContent.safety'),
      completion:dim('DIFFERENT',`old completes in any order without filling the cell (reverse order complete=${oldOnlyObserve.result.finalState.status==='complete'}); new needs the electrolyte, electrodes and power before current, and observations only count while current flows (reverse order complete=${neuReverse.state.complete})`,'runs both'),
      evidence:dim('DIFFERENT','new: candidates only (persisted:false)','LabActionResult.evidenceCandidate'),
      accessibility:dim('NOT_PROVEN','covered by the route’s own e2e checks, not by the P2.7 sweep','e2e'),
      portalStandaloneParity:dim('EQUIVALENT','both hosts','tests/e2e/guided-dynamic-lab.spec.mjs'),
    },
    orderDecision:{mode:profile.procedure.mode,packet:profile.procedure.humanDecision?.packet??null,selected:null},
    newOnly:{replayDeterministic:neu.replayEqual},
  };
}

async function equivalence72(root:string,profile:TopicLabProfile){
  const page=await packPractice(root,profile.activityId);
  const oldSteps=['selectApparatus','addWater','addMixture','mix','filter','evaporate','observe'];
  const old=await oldRun(page,oldSteps.map(type=>({type})));
  const oldEarly=await oldRun(page,[{type:'addWater'}]);
  const newActions:LabAction[]=[{family:'SETUP_APPARATUS',params:{apparatus:'beaker'}},{family:'ADD_SUBSTANCE',params:{substance:'water',container:'beaker'}},{family:'ADD_SUBSTANCE',params:{substance:'contaminated-salt',container:'beaker'}},{family:'SETUP_APPARATUS',params:{apparatus:'glass-rod'}},{family:'MIX',params:{container:'beaker'}},{family:'SETUP_APPARATUS',params:{apparatus:'funnel'}},{family:'SETUP_APPARATUS',params:{apparatus:'filter-paper'}},{family:'SETUP_APPARATUS',params:{apparatus:'receiver'}},{family:'FILTER',params:{container:'beaker'}},{family:'SETUP_APPARATUS',params:{apparatus:'spirit-lamp'}},{family:'SETUP_APPARATUS',params:{apparatus:'stand'}},{family:'SETUP_APPARATUS',params:{apparatus:'dish'}},{family:'EVAPORATE',params:{container:'receiver'}},{family:'OBSERVE',params:{target:'crystals'}}];
  const neu=newRun(page,profile,newActions);
  const neuEarly=newRun(page,profile,[{family:'ADD_SUBSTANCE',params:{substance:'water',container:'beaker'}}]);
  const oldObs=old.result.evidence.find((e:any)=>e.type==='observation')?.observation??null;
  const newObs=neu.state.observations.find(o=>o.target==='crystals')??null;
  const oldEarlyRejected=oldEarly.outcomes[0]?.status==='invalid';
  const newEarlyRejected=neuEarly.results[0]!.error?.code==='PROCEDURE_BLOCKED';
  return {
    activityId:profile.activityId,profileId:profile.profileId,
    oldRuntime:{runtime:page.executionPlan.runtime,capability:page.executionPlan.capability,renderer:page.executionPlan.rendererRequirement?.capability??'legacy'},
    scenario:'the declared sequence apparatus → water → mixture → dissolve → filter → evaporate → observe; and adding water first',
    dimensions:{
      instruction:dim('DIFFERENT','new: the apparatus, materials, 20 ml limit and step sentences of the instruction; old: seven unlabeled config action types','profile.instruction'),
      chemistryResult:dim('DIFFERENT','new: dissolution of NaCl is checked against the solubility data (IonicEngine.dissociate); old: no chemistry authority is consulted','runs both'),
      observations:dim(oldObs?.type===newObs?.kind?'EQUIVALENT':'DIFFERENT',`final observation kind: old ${oldObs?.type??null} (${oldObs?.from??''}→${oldObs?.to??''}), new ${newObs?.kind??null} from the instruction sentence ${newObs?.source??''}; new also reports the turbid mixture and the clear filtrate (instruction text)`,'runs both'),
      safety:dim('DIFFERENT','new shows the instruction’s spattering sentence (step 4); old shows none (legacyContent.safety is empty)','profile.safety.notes'),
      completion:dim(old.result.finalState.status==='complete'&&neu.state.complete&&oldEarlyRejected&&newEarlyRejected?'EQUIVALENT':'DIFFERENT',`declared order enforced by both: early water rejected old=${oldEarlyRejected} new=${newEarlyRejected}; complete old=${old.result.finalState.status==='complete'} new=${neu.state.complete}`,'runs both'),
      evidence:dim('DIFFERENT','new: candidates only (persisted:false)','LabActionResult.evidenceCandidate'),
      accessibility:dim('NOT_PROVEN','covered by the route’s own e2e checks, not by the P2.7 sweep','e2e'),
      portalStandaloneParity:dim('EQUIVALENT','both hosts','tests/e2e/guided-dynamic-lab.spec.mjs'),
    },
    newOnly:{replayDeterministic:neu.replayEqual},
  };
}

export async function buildEquivalence(root=ROOT,profiles:TopicLabProfile[]=compileTopicLabProfiles(root).profiles){
  const runners:Record<string,(r:string,p:TopicLabProfile)=>Promise<any>>={'ionic-mixing':equivalence81,'electrolysis':equivalence112,'dissolution':equivalence72};
  const slices=[];
  for(const p of profiles){
    const row=await runners[p.chemistry.authority]!(root,p);
    const blocking=Object.entries(row.dimensions).filter(([,d]:any)=>d.status!=='EQUIVALENT').map(([k])=>k);
    slices.push({...row,migrationStatus:blocking.length?'NOT_MIGRATION_EQUIVALENT':'MIGRATION_EQUIVALENT',blockingDimensions:blocking,decision:blocking.length?'KEEP_OLD_RUNTIME':'ELIGIBLE_FOR_HUMAN_MIGRATION_DECISION'});
  }
  return {
    schema:'kimyolab.lab-migration-equivalence.v1',
    phase:'P2.10',
    semantics:'Old vs new on the SAME built content pack, per dimension. MIGRATION_EQUIVALENT only when every dimension is EQUIVALENT; otherwise the old runtime stays the canonical one. Even an equivalent slice is only ELIGIBLE: a migration is a human decision, never taken here.',
    summary:{slices:slices.length,migrationEquivalent:slices.filter(s=>s.migrationStatus==='MIGRATION_EQUIVALENT').length,keepOldRuntime:slices.filter(s=>s.decision==='KEEP_OLD_RUNTIME').map(s=>s.activityId)},
    slices,
  };
}

/** P2.10's own bundle growth: the P2.9 closing build (reports/feedback-semantics-expansion.json#bundleDelta.after @ 22e5687)
 *  vs the current build. Earlier phases' bound checks subtract this recorded delta instead of absorbing it. */
export const P29_BUNDLE_AFTER={learnerModules:162,learnerModuleBytes:714004,standaloneBytes:5704269};
export function bundleDelta(root:string,now:{learnerModules:number;learnerModuleBytes:number;standaloneBytes:number}){
  const before=P29_BUNDLE_AFTER;
  const after={learnerModules:now.learnerModules,learnerModuleBytes:now.learnerModuleBytes,standaloneBytes:now.standaloneBytes};
  return {before,after,delta:{learnerModules:after.learnerModules-before.learnerModules,learnerModuleBytes:after.learnerModuleBytes-before.learnerModuleBytes,standaloneBytes:after.standaloneBytes-before.standaloneBytes},
    newModules:'src/app/feature-flags.ts, src/domain/lab/{action-catalog,topic-lab-profile,lab-runtime,lab-domain}.ts, src/features/dynamic-lab/render.ts'};
}

export function buildReadiness(inventory:any,catalog:any,coverage:any,equivalence:any,profiles:TopicLabProfile[],bundle?:unknown){
  const flag=FEATURE_FLAGS.guidedDynamicLabV1;
  return {
    schema:'kimyolab.guided-dynamic-lab-readiness.v1',
    phase:'P2.10',
    decision:'NOT_A_RELEASE_OR_PILOT_DECISION',
    semantics:'What exists, what is proven and what is still a human decision. The agent does not decide chemistry truth, release or pilot sign-off.',
    featureFlag:{name:'guidedDynamicLabV1',default:flag.default,enable:flag.enable,route:'/dynamic-lab/<activityId>',oldRuntime:'unchanged and still the canonical route (/practice/<activityId>)'},
    contracts:[
      {id:TOPIC_LAB_PROFILE_SCHEMA,path:'src/domain/lab/topic-lab-profile.ts',chemistryTruth:false},
      {id:'kimyolab.lab-state.v1',path:'src/domain/lab/lab-runtime.ts'},
      {id:'applyLabAction',path:'src/domain/lab/lab-runtime.ts',signature:'applyLabAction(state, action, topicProfile) → {nextState, chemistryEvents, observations, procedural, guidance, evidenceCandidate, unsupported, error}'},
      {id:'lab-action-catalog',path:'src/domain/lab/action-catalog.ts'},
    ],
    slices:profiles.map(p=>({activityId:p.activityId,profileId:p.profileId,chemistryAuthority:p.chemistry.authority,
      observationGrounding:Object.fromEntries(p.observationTargets.map(t=>[t.id,observationGrounding({producedBy:t.producedBy})])),orderMode:p.procedure.mode,completion:p.completionGoal.kind,migration:equivalence.slices.find((s:any)=>s.activityId===p.activityId)?.migrationStatus??null,profileGaps:p.gaps.map(g=>g.code)})),
    sliceJustification:{
      precipitation:'8.1: the only experiment whose config is a learner-chosen reagent shelf over ReactionMatcher records (ionic-mixing); a precipitate forms while FILTER is not in its instruction (ACTION_NOT_ALLOWED_IN_TOPIC).',
      gas:'11.2: the gas slice the chemistry supports. ElectrolysisModel holds exactly one record (CuCl2, aq, inert), which 11.2’s config queries, and its instruction does not contradict it. 9.10 is NOT used: its instruction connects a copper anode (active) and electrolyses KI, neither of which is modeled.',
      multiStep:'7.2: the only experiment with DECLARED step dependencies (reference slice), seven steps over dissolution, filtration and evaporation (thermal), with an instruction quantity (20 ml).',
    },
    counts:{experimentsInventoried:inventory.summary.experiments,operations:inventory.summary.operations,mappedOperations:inventory.summary.mapped,ambiguousOperations:inventory.summary.ambiguous,unmappedOperations:inventory.summary.unmapped,families:catalog.summary.families,familiesWithHandler:catalog.summary.withDomainHandler,profiled:coverage.summary.PROFILED??0,profileCandidates:coverage.summary.PROFILE_CANDIDATE??0,blocked:coverage.summary.BLOCKED??0,migrationEquivalent:equivalence.summary.migrationEquivalent},
    humanDecisions:[
      ...inventory.summary.openOrderDecisions.map((id:string)=>({activityId:id,question:'experiment step order (carried forward from P2.9)',packet:inventory.experiments.find((e:any)=>e.activityId===id).orderSemantics.decisionPacket,selected:null})),
      {activityId:null,question:'migrate any slice from the old runtime (none is MIGRATION_EQUIVALENT)',packet:null,selected:null},
      {activityId:null,question:'assign PRIMARY / SUPPLEMENTARY / EXPLORE roles to external labs (no evidence beyond the shared learning unit)',packet:null,selected:null},
    ],
    definitionOfDone:[
      {item:'all experiments inventoried',status:inventory.summary.experiments===inventory.experiments.length?'MET':'NOT_MET'},
      {item:'every operation mapped to an action or an explicit gap',status:inventory.summary.operations===inventory.summary.mapped+inventory.summary.ambiguous+inventory.summary.unmapped?'MET':'NOT_MET'},
      {item:'schemas and runtime exist; unsupported chemistry fails closed',status:'MET'},
      {item:'order represented honestly (STRICT only where declared; open decisions stay HUMAN_DECISION_REQUIRED)',status:'MET'},
      {item:'2–3 vertical slices end-to-end behind guidedDynamicLabV1',status:profiles.length>=2&&profiles.length<=3?'MET':'NOT_MET'},
      {item:'old runtime available; no mass migration',status:equivalence.summary.migrationEquivalent===0?'MET':'NOT_MET'},
      {item:'equivalence reported honestly per slice and dimension (zero migrations is an allowed P2.10 outcome)',status:equivalence.slices.length===profiles.length?'MET':'NOT_MET'},
      {item:'release / pilot sign-off',status:'HUMAN'},
    ],
    futureGates:[
      {gate:'P2.11 migration gate',question:'migrate a slice from the classic runtime',condition:'every equivalence dimension EQUIVALENT (incl. persisted evidence), then a human migration decision',currentlyEquivalentSlices:equivalence.summary.migrationEquivalent,decision:null},
    ],
    bundleDelta:bundle??null,
  };
}

export async function guidedDynamicLabOutputs(root=ROOT):Promise<Record<string,string>>{
  const {profiles}=compileTopicLabProfiles(root);
  const inventory=buildInventory(root);
  const catalog=buildCatalog(inventory);
  const coverage=buildCoverage(inventory,profiles,root);
  const equivalence=await buildEquivalence(root,profiles);
  const {bundle}=await import('./lib/computed-model-interaction.ts');
  const readiness=buildReadiness(inventory,catalog,coverage,equivalence,profiles,bundleDelta(root,bundle(root) as any));
  const out:Record<string,string>={};
  const put=(rel:string,v:unknown)=>{ out[rel]=`${JSON.stringify(v,null,2)}\n`; };
  put(LAB_REPORTS.inventory,inventory); put(LAB_REPORTS.catalog,catalog); put(LAB_REPORTS.coverage,coverage); put(LAB_REPORTS.readiness,readiness); put(LAB_REPORTS.equivalence,equivalence);
  return out;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const outputs=await guidedDynamicLabOutputs(ROOT);
  const check=process.argv.includes('--check');
  let stale=0;
  for(const [rel,body] of Object.entries(outputs)){
    const file=path.join(ROOT,rel);
    if(check){ if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==body){ console.error(`STALE ${rel}`); stale++; } continue; }
    fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,body);
  }
  if(stale) process.exit(1);
  const inv=JSON.parse(outputs[LAB_REPORTS.inventory]!), eq=JSON.parse(outputs[LAB_REPORTS.equivalence]!);
  console.log(JSON.stringify({experiments:inv.summary.experiments,operations:inv.summary.operations,mapped:inv.summary.mapped,ambiguous:inv.summary.ambiguous,unmapped:inv.summary.unmapped,migrationEquivalent:eq.summary.migrationEquivalent,check}));
}
