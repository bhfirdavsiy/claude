// P2.10 — the lab action catalog (ADR-P2-011).
//
// The laboratory INSTRUCTION is the pedagogical source of the actions a topic may offer. This module holds the two
// declared pieces both the audit and the dynamic lab use:
//
//   LAB_ACTION_FAMILIES — the canonical action families, their typed parameters, the apparatus and state they need,
//                         and whether a domain handler / renderer exists for them in the guided dynamic lab;
//   INSTRUCTION_VERBS   — a declared lexicon from the imperative verbs found in the repository's instruction steps
//                         (legacyContent.steps) to a family. It CLASSIFIES instruction text; it never decides chemistry.
//
// A verb not in the lexicon, or a step without an imperative verb, is an explicit UNMAPPED_OPERATION gap — never a
// guessed family. Ambiguous verbs carry a context rule; when no rule matches the operation stays AMBIGUOUS.

export type LabActionFamily=
  |'SETUP_APPARATUS'|'ADD_SUBSTANCE'|'TRANSFER'|'MIX'|'HEAT'|'STOP_HEAT'|'EVAPORATE'|'FILTER'|'SETTLE'|'SEPARATE'
  |'PASS_GAS'|'COLLECT_GAS'|'SEAL'|'IGNITE'|'BRING_NEAR'|'ELECTRIC_CURRENT'|'WAIT'|'OBSERVE'|'TEST'|'COMPARE'
  |'INFER'|'RECORD'|'EXPLAIN'|'PREPARE_SUBSTANCE'|'WASH'|'SELECT'|'STUDY'|'REPEAT'|'CONTINUE'|'RESET'|'SAFETY_PROHIBITION';

/** P2.10 closeout: what an operation IS, kept apart so a learner task is never reported as missing chemistry.
 *   STATE_ACTION       — a physical/procedural operation that may change LabState (needs a domain/procedure handler);
 *   OBSERVATION_ACTION — inspects a state/event that already exists; never produces an outcome of its own;
 *   LEARNER_RESPONSE   — a pedagogical response (compare, infer, record, explain, study, choose); it never changes
 *                        chemistry state and needs a CHECKER, a rubric or a human/content decision — not a handler;
 *   CONTROL            — lab-level control (RESET, restart/repeat, continue); never chemistry;
 *   SAFETY_RULE        — a prohibition in the instruction text ("… qaratmang"); not a learner action at all. */
export type LabOperationKind='STATE_ACTION'|'OBSERVATION_ACTION'|'LEARNER_RESPONSE'|'CONTROL'|'SAFETY_RULE';
export const OPERATION_KINDS:readonly LabOperationKind[]=['STATE_ACTION','OBSERVATION_ACTION','LEARNER_RESPONSE','CONTROL','SAFETY_RULE'];
const KIND:Readonly<Record<LabActionFamily,LabOperationKind>>={
  SETUP_APPARATUS:'STATE_ACTION',ADD_SUBSTANCE:'STATE_ACTION',TRANSFER:'STATE_ACTION',MIX:'STATE_ACTION',HEAT:'STATE_ACTION',STOP_HEAT:'STATE_ACTION',
  EVAPORATE:'STATE_ACTION',FILTER:'STATE_ACTION',SETTLE:'STATE_ACTION',SEPARATE:'STATE_ACTION',PASS_GAS:'STATE_ACTION',COLLECT_GAS:'STATE_ACTION',
  SEAL:'STATE_ACTION',IGNITE:'STATE_ACTION',BRING_NEAR:'STATE_ACTION',ELECTRIC_CURRENT:'STATE_ACTION',WAIT:'STATE_ACTION',WASH:'STATE_ACTION',
  PREPARE_SUBSTANCE:'STATE_ACTION',
  OBSERVE:'OBSERVATION_ACTION',TEST:'OBSERVATION_ACTION',
  COMPARE:'LEARNER_RESPONSE',INFER:'LEARNER_RESPONSE',RECORD:'LEARNER_RESPONSE',EXPLAIN:'LEARNER_RESPONSE',STUDY:'LEARNER_RESPONSE',SELECT:'LEARNER_RESPONSE',
  // REPEAT in the repository means "repeat the procedure with another substance" (8.6), i.e. it re-runs state actions —
  // a restart is RESET (CONTROL); no instruction step uses "repeat" to mean restart
  REPEAT:'STATE_ACTION',
  RESET:'CONTROL',CONTINUE:'CONTROL',
  SAFETY_PROHIBITION:'SAFETY_RULE',
};
/** State actions whose outcome depends on chemistry (a substance is added, mixed, heated, burned, electrolysed,
 *  produced or passed through another): an experiment containing one needs a chemistry authority, or it fails closed.
 *  Purely physical handling (set up, seal, filter, settle, wait, transfer, …) does not. Declared, not inferred. */
export const COMPOSITION_CHANGING_FAMILIES:ReadonlySet<LabActionFamily>=new Set(['ADD_SUBSTANCE','MIX','HEAT','EVAPORATE','PASS_GAS','IGNITE','BRING_NEAR','ELECTRIC_CURRENT','PREPARE_SUBSTANCE','REPEAT']);
/** Only these kinds may be offered by a topic profile (RESET is lab-level; a prohibition is not an action). */
export const TOPIC_ACTION_KINDS:ReadonlySet<LabOperationKind>=new Set(['STATE_ACTION','OBSERVATION_ACTION','LEARNER_RESPONSE']);

export interface LabActionParameter {
  name:string;
  type:'apparatus'|'container'|'substance'|'quantity'|'electrode'|'text'|'target';
  required:boolean;
  /** where the allowed values come from: never a free value — the topic profile lists them */
  valuesFrom:'profile.apparatus'|'profile.containers'|'profile.substances'|'profile.limits'|'profile.observationTargets'|'learner-text';
}

export interface LabActionDefinition {
  family:LabActionFamily;
  kind:LabOperationKind;
  /** canonical id used in the lab-state contract and in action logs */
  id:string;
  parameters:LabActionParameter[];
  /** apparatus KINDS the action needs (matched against the profile's apparatus kinds; a profile's familyApparatus
   *  overrides this when its instruction names the apparatus). 'container' = the container parameter itself. */
  apparatusRequirements:string[];
  /** state facts that must hold (checked at the domain boundary by applyLabAction) */
  statePreconditions:string[];
  /** applyLabAction implements this family (STATE/OBSERVATION: a domain handler, else ACTION_UNSUPPORTED; LEARNER_RESPONSE:
   *  a checker, else LEARNER_RESPONSE_CHECKER_MISSING; CONTROL/SAFETY_RULE: never a topic action) */
  domainHandler:boolean;
  /** LEARNER_RESPONSE only: the checker that judges the response, or null (no correctness is ever fabricated) */
  checker:string|null;
  /** which chemistry authority the handler orchestrates, when any (never an invented outcome) */
  chemistryAuthority:string|null;
  /** a renderer exists for this family in the dynamic lab (generic object → action → parameter UI) */
  renderer:boolean;
  /** what the accessible version must provide (no mouse-only drag) */
  accessibility:string[];
}

const KEYBOARD=['keyboard: object button → action button → parameter form','accessible name from the catalog','result announced in a polite live region','no drag required'];
const p=(name:string,type:LabActionParameter['type'],valuesFrom:LabActionParameter['valuesFrom'],required=true):LabActionParameter=>({name,type,required,valuesFrom});
const CHECKERS:Partial<Record<LabActionFamily,string>>={RECORD:'net ionic equation: IonicEngine.netIonicEquation + compareNetIonic (ionic-mixing topics only)'};
const def=(family:LabActionFamily,id:string,parameters:LabActionParameter[],apparatusRequirements:string[],statePreconditions:string[],domainHandler:boolean,chemistryAuthority:string|null,renderer=domainHandler,extraA11y:string[]=[]):LabActionDefinition=>({family,kind:KIND[family],id,parameters,apparatusRequirements,statePreconditions,domainHandler,checker:KIND[family]==='LEARNER_RESPONSE'?CHECKERS[family]??null:null,chemistryAuthority,renderer,accessibility:[...KEYBOARD,...extraA11y]});
export const familyKind=(family:LabActionFamily)=>KIND[family];

/** The canonical families. `domainHandler` is TRUE only where applyLabAction (apply-lab-action.ts) implements it. */
export const LAB_ACTION_FAMILIES:readonly LabActionDefinition[]=Object.freeze([
  def('SETUP_APPARATUS','lab.setup',[p('apparatus','apparatus','profile.apparatus')],[],['apparatus listed by the topic profile'],true,null),
  def('ADD_SUBSTANCE','lab.add',[p('substance','substance','profile.substances'),p('container','container','profile.containers'),p('quantity','quantity','profile.limits',false)],['container'],['container set up','substance on the topic shelf','quantity within the declared limit (when declared)'],true,'SpeciesRegistry + IonicEngine.dissociate; ReactionMatcher via evaluateIonicMixing when two solutions meet'),
  def('TRANSFER','lab.transfer',[p('from','container','profile.containers'),p('to','container','profile.containers')],['container'],['source container has contents'],false,null),
  def('MIX','lab.mix',[p('container','container','profile.containers')],[],['two solutions in the container (ionic mixing) or a solvent and a sample (dissolution)'],true,'evaluateIonicMixing (ReactionMatcher) or IonicEngine.dissociate (dissolution of a declared solute)'),
  def('HEAT','lab.heat',[p('container','container','profile.containers')],['heat-source'],['heat source set up','container has contents'],false,null),
  def('STOP_HEAT','lab.stop-heat',[p('container','container','profile.containers')],['heat-source'],['container is being heated'],false,null),
  def('EVAPORATE','lab.evaporate',[p('container','container','profile.containers')],['heat-source','evaporating-dish'],['container holds a filtrate (solution)'],true,'procedure only: the observation comes from the instruction text (no evaporation model exists)'),
  def('FILTER','lab.filter',[p('container','container','profile.containers')],['funnel','filter-paper','receiver'],['an insoluble solid is present in the container','filter set up'],true,'procedure only: separates the declared insoluble part from the solution'),
  def('SETTLE','lab.settle',[p('container','container','profile.containers')],[],['container has a suspension'],false,null),
  def('SEPARATE','lab.separate',[p('container','container','profile.containers')],[],['container has more than one phase'],false,null),
  def('PASS_GAS','lab.pass-gas',[p('from','container','profile.containers'),p('to','container','profile.containers')],['gas delivery tube'],['a gas is being produced'],false,null),
  def('COLLECT_GAS','lab.collect-gas',[p('container','container','profile.containers')],['gas collection vessel'],['a gas is being produced'],false,null),
  def('SEAL','lab.seal',[p('container','container','profile.containers')],['stopper'],[],false,null),
  def('IGNITE','lab.ignite',[p('target','target','profile.observationTargets')],['ignition source'],['safety rule of the topic allows it'],false,null),
  def('BRING_NEAR','lab.bring-near',[p('target','target','profile.observationTargets')],[],[],false,null),
  def('ELECTRIC_CURRENT','lab.current',[p('container','container','profile.containers')],['dc-source','electrodes'],['electrolyte in the cell','electrodes inserted'],true,'ElectrolysisModel.resolve (electrolyte, phase, electrode)'),
  def('WAIT','lab.wait',[],[],[],false,null),
  def('OBSERVE','lab.observe',[p('target','target','profile.observationTargets')],[],['the observed process has happened in the state'],true,'the authority that produced the state (ReactionMatcher record, ElectrolysisModel record, instruction text)',true,['observation as text, never colour alone']),
  def('TEST','lab.test',[p('target','target','profile.observationTargets')],[],[],false,null),
  def('COMPARE','lab.compare',[],[],[],false,null),
  def('INFER','lab.infer',[],[],[],false,null),
  def('RECORD','lab.record',[p('text','text','learner-text')],[],['a modeled reaction was observed'],true,null),
  def('EXPLAIN','lab.explain',[p('text','text','learner-text')],[],[],false,null),
  def('PREPARE_SUBSTANCE','lab.prepare',[p('substance','substance','profile.substances')],[],[],false,null),
  def('WASH','lab.wash',[p('container','container','profile.containers')],[],['container is not empty'],true,null),
  def('SELECT','lab.select',[p('substance','substance','profile.substances')],[],[],false,null),
  def('STUDY','lab.study',[],[],[],false,null),
  def('REPEAT','lab.repeat',[],[],[],false,null),
  def('RESET','lab.reset',[],[],[],false,null),
  def('SAFETY_PROHIBITION','lab.safety-prohibition',[],[],[],false,null),
  def('CONTINUE','lab.continue',[],[],[],false,null),
]);

export const familyDefinition=(family:LabActionFamily)=>LAB_ACTION_FAMILIES.find(d=>d.family===family);

interface VerbRule { family:LabActionFamily; ambiguous?:boolean; context?:Array<{ifPreceding:RegExp;family:LabActionFamily}> }

/** Imperative verbs found in legacyContent.steps (P2.10 audit) → family. Declared classification, not chemistry. */
export const INSTRUCTION_VERBS:Readonly<Record<string,VerbRule>>=Object.freeze({
  'kuzating':{family:'OBSERVE'},'ko‘ring':{family:'OBSERVE'},'chiqing':{family:'STUDY'},
  'qo‘shing':{family:'ADD_SUBSTANCE'},'quying':{family:'ADD_SUBSTANCE'},'soling':{family:'ADD_SUBSTANCE'},'tomizing':{family:'ADD_SUBSTANCE'},'to‘ldiring':{family:'ADD_SUBSTANCE'},
  'tushiring':{family:'ADD_SUBSTANCE',ambiguous:true,context:[{ifPreceding:/elektrod/,family:'SETUP_APPARATUS'},{ifPreceding:/nay/,family:'PASS_GAS'},{ifPreceding:/(?:idish|kosacha)ga$/,family:'ADD_SUBSTANCE'}]},
  'kiriting':{family:'RECORD',ambiguous:true,context:[{ifPreceding:/jadval/,family:'RECORD'},{ifPreceding:/cho‘p|idish/,family:'BRING_NEAR'}]},
  'qizdiring':{family:'HEAT'},'yoqing':{family:'HEAT'},'suyuqlantiring':{family:'HEAT'},'gidrolizlang':{family:'HEAT'},
  'o‘chiring':{family:'STOP_HEAT'},'to‘xtating':{family:'STOP_HEAT'},
  'bug‘lating':{family:'EVAPORATE'},'filtrlang':{family:'FILTER'},'tindiring':{family:'SETTLE'},
  'ajrating':{family:'SEPARATE'},'bo‘ling':{family:'SEPARATE'},
  'aralashtiring':{family:'MIX'},'chayqating':{family:'MIX'},'ishqalang':{family:'MIX'},
  'kechiring':{family:'PASS_GAS'},'loyqalantiring':{family:'PASS_GAS'},
  'o‘tkazing':{family:'PASS_GAS',ambiguous:true,context:[{ifPreceding:/stakan|idish/,family:'TRANSFER'},{ifPreceding:/dan\b|co2/,family:'PASS_GAS'}]},
  'ko‘chiring':{family:'TRANSFER'},
  'yig‘ing':{family:'COLLECT_GAS',ambiguous:true,context:[{ifPreceding:/apparat|asbob|sxema/,family:'SETUP_APPARATUS'},{ifPreceding:/gaz|ammiak|vodorod|kislorod/,family:'COLLECT_GAS'}]},
  'yoping':{family:'SEAL'},'berkiting':{family:'SEAL'},
  'yondiring':{family:'IGNITE'},'yaqinlashtiring':{family:'BRING_NEAR'},'tuting':{family:'BRING_NEAR',ambiguous:true,context:[{ifPreceding:/qiya$/,family:'SETUP_APPARATUS'},{ifPreceding:/ustida|oqimiga|alanga/,family:'BRING_NEAR'}]},
  'ulang':{family:'ELECTRIC_CURRENT'},'uzing':{family:'ELECTRIC_CURRENT'},
  'joylashtiring':{family:'SETUP_APPARATUS'},'mahkamlang':{family:'SETUP_APPARATUS'},'sozlang':{family:'SETUP_APPARATUS'},'moslang':{family:'SETUP_APPARATUS'},
  'qo‘ying':{family:'SETUP_APPARATUS'},'buklang':{family:'SETUP_APPARATUS'},'qirqing':{family:'SETUP_APPARATUS'},'oching':{family:'SETUP_APPARATUS'},
  'kuting':{family:'WAIT'},
  'tekshiring':{family:'TEST'},'aniqlang':{family:'INFER'},'isbotlang':{family:'INFER'},
  'taqqoslang':{family:'COMPARE'},'solishtiring':{family:'COMPARE'},'farqlang':{family:'COMPARE'},
  'yozing':{family:'RECORD'},'ifodalang':{family:'RECORD'},'tuzing':{family:'RECORD'},'nomlang':{family:'RECORD'},'belgilang':{family:'RECORD'},
  'qiling':{family:'RECORD',ambiguous:true,context:[{ifPreceding:/qayd$/,family:'RECORD'},{ifPreceding:/xulosa$/,family:'INFER'},{ifPreceding:/hosil$/,family:'PREPARE_SUBSTANCE'}]},
  'eting':{family:'CONTINUE',ambiguous:true,context:[{ifPreceding:/davom$/,family:'CONTINUE'},{ifPreceding:/qayd$/,family:'RECORD'}]},
  'izohlang':{family:'EXPLAIN'},'tushuntiring':{family:'EXPLAIN'},'ko‘rsating':{family:'EXPLAIN'},
  'bering':{family:'EXPLAIN',ambiguous:true,context:[{ifPreceding:/e’tibor$/,family:'OBSERVE'},{ifPreceding:/ma’lumot$|javob$|izoh$/,family:'EXPLAIN'}]},
  'oling':{family:'PREPARE_SUBSTANCE'},'tayyorlang':{family:'PREPARE_SUBSTANCE'},
  'yuving':{family:'WASH'},'surting':{family:'WASH'},'namlang':{family:'WASH'},
  'tanlang':{family:'SELECT'},'o‘rganing':{family:'STUDY'},'tanishing':{family:'STUDY'},
  'takrorlang':{family:'REPEAT'},'qaratmang':{family:'SAFETY_PROHIBITION'},'bajaring':{family:'SEPARATE',ambiguous:true,context:[]},
});

/** Words ending like an imperative that are NOT verbs (nouns, genitive forms, adverbs). Declared, small, audited. */
const NOT_VERBS=new Set(['rang','so‘ng','teng','ning']);

export interface InstructionOperation {
  verb:string;
  family:LabActionFamily|null;
  status:'MAPPED'|'AMBIGUOUS'|'UNMAPPED_OPERATION';
}

/** The operations of one instruction step: each imperative verb, in text order. Deterministic; no chemistry. */
export function classifyInstructionStep(text:string):InstructionOperation[]{
  const words=text.toLowerCase().replace(/[.,;:()«»"!?—–]/g,' ').split(/\s+/).filter(Boolean);
  const out:InstructionOperation[]=[];
  words.forEach((word,i)=>{
    const rule=INSTRUCTION_VERBS[word];
    // a genitive noun ("…ning") is not a verb, unless the lexicon lists the word (o‘rganing, tanishing)
    if(!rule&&(!/(?:ing|ng)$/.test(word)||word.length<4||NOT_VERBS.has(word)||/ning$/.test(word))) return;
    if(!rule){ out.push({verb:word,family:null,status:'UNMAPPED_OPERATION'}); return; }
    if(!rule.ambiguous){ out.push({verb:word,family:rule.family,status:'MAPPED'}); return; }
    // nearest context first: the object word right before the verb decides before words further back (≤ 8)
    let hit:{family:LabActionFamily}|undefined;
    for(let n=1;n<=Math.min(8,i)&&!hit;n++){ const preceding=words.slice(i-n,i).join(' '); hit=rule.context?.find(c=>c.ifPreceding.test(preceding)); }
    out.push(hit?{verb:word,family:hit.family,status:'MAPPED'}:{verb:word,family:rule.family,status:'AMBIGUOUS'});
  });
  if(!out.length) out.push({verb:'',family:null,status:'UNMAPPED_OPERATION'});
  return out;
}

/** Config action types of the existing runtimes → family (explicit; an unknown type stays unmapped). */
export const CONFIG_ACTION_TYPES:Readonly<Record<string,LabActionFamily>>=Object.freeze({
  selectApparatus:'SETUP_APPARATUS',addWater:'ADD_SUBSTANCE',addMixture:'ADD_SUBSTANCE',mix:'MIX',filter:'FILTER',evaporate:'EVAPORATE',observe:'OBSERVE',
  selectReagent:'ADD_SUBSTANCE',writeEquation:'RECORD',record:'RECORD',
  connectCurrent:'ELECTRIC_CURRENT',observeCathode:'OBSERVE',observeAnode:'OBSERVE',
  generateEthene:'PREPARE_SUBSTANCE',addBromineWater:'ADD_SUBSTANCE',prepareCuOH2:'PREPARE_SUBSTANCE',addGlycerol:'ADD_SUBSTANCE',
  selectAceticAcid:'SELECT',addIndicator:'ADD_SUBSTANCE',addCarbonate:'ADD_SUBSTANCE',
  mixFatAlkali:'MIX',heat:'HEAT',addCuSO4:'ADD_SUBSTANCE',addNaOH:'ADD_SUBSTANCE',
  selectSalt:'SELECT',predictMedium:'INFER',
});
