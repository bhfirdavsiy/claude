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

                            
                                                                                                                 
                                                                                                             
                                                                                                                           

/** P2.10 closeout: what an operation IS, kept apart so a learner task is never reported as missing chemistry.
 *   STATE_ACTION       — a physical/procedural operation that may change LabState (needs a domain/procedure handler);
 *   OBSERVATION_ACTION — inspects a state/event that already exists; never produces an outcome of its own;
 *   LEARNER_RESPONSE   — a pedagogical response (compare, infer, record, explain, study, choose); it never changes
 *                        chemistry state and needs a CHECKER, a rubric or a human/content decision — not a handler;
 *   CONTROL            — lab-level control (RESET, restart/repeat, continue); never chemistry;
 *   SAFETY_RULE        — a prohibition in the instruction text ("… qaratmang"); not a learner action at all. */
                                                                                                            
export const OPERATION_KINDS                            =['STATE_ACTION','OBSERVATION_ACTION','LEARNER_RESPONSE','CONTROL','SAFETY_RULE'];
const KIND                                                   ={
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
export const COMPOSITION_CHANGING_FAMILIES                             =new Set(['ADD_SUBSTANCE','MIX','HEAT','EVAPORATE','PASS_GAS','IGNITE','BRING_NEAR','ELECTRIC_CURRENT','PREPARE_SUBSTANCE','REPEAT']);
/** Only these kinds may be offered by a topic profile (RESET is lab-level; a prohibition is not an action). */
export const TOPIC_ACTION_KINDS                              =new Set(['STATE_ACTION','OBSERVATION_ACTION','LEARNER_RESPONSE']);

                                     
              
                                                                                  
                   
                                                                                              
                                                                                                                                        
 

                                      
                         
                        
                                                                       
            
                                  
                                                                                                                  
                                                                                                                
                                 
                                                                                      
                              
                                                                                                                            
                                                                                                     
                        
                                                                                                                 
                      
                                                                                                 
                                 
                                                                                                      
                   
                                                                      
                         
 

const KEYBOARD=['keyboard: object button → action button → parameter form','accessible name from the catalog','result announced in a polite live region','no drag required'];
const p=(name       ,type                           ,valuesFrom                                 ,required=true)                   =>({name,type,required,valuesFrom});
const CHECKERS                                        ={RECORD:'net ionic equation: IonicEngine.netIonicEquation + compareNetIonic (ionic-mixing topics only)'};
const def=(family                ,id       ,parameters                     ,apparatusRequirements         ,statePreconditions         ,domainHandler        ,chemistryAuthority            ,renderer=domainHandler,extraA11y         =[])                    =>({family,kind:KIND[family],id,parameters,apparatusRequirements,statePreconditions,domainHandler,checker:KIND[family]==='LEARNER_RESPONSE'?CHECKERS[family]??null:null,chemistryAuthority,renderer,accessibility:[...KEYBOARD,...extraA11y]});
export const familyKind=(family                )=>KIND[family];

/** The canonical families. `domainHandler` is TRUE only where applyLabAction (apply-lab-action.ts) implements it. */
export const LAB_ACTION_FAMILIES                               =Object.freeze([
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

export const familyDefinition=(family                )=>LAB_ACTION_FAMILIES.find(d=>d.family===family);

/** An unambiguous verb names its family. An ambiguous verb has NO family of its own: only a matching context rule
 *  resolves it; unresolved, the operation stays AMBIGUOUS with family null (never a placeholder family). */
                     
                                             
                                                                                

/** Imperative verbs found in legacyContent.steps (P2.10 audit) → family. Declared classification, not chemistry. */
export const INSTRUCTION_VERBS                                  =Object.freeze({
  'kuzating':{family:'OBSERVE'},'ko‘ring':{family:'OBSERVE'},'chiqing':{family:'STUDY'},
  'qo‘shing':{family:'ADD_SUBSTANCE'},'quying':{family:'ADD_SUBSTANCE'},'soling':{family:'ADD_SUBSTANCE'},'tomizing':{family:'ADD_SUBSTANCE'},'to‘ldiring':{family:'ADD_SUBSTANCE'},
  'tushiring':{ambiguous:true,context:[{ifPreceding:/elektrod/,family:'SETUP_APPARATUS'},{ifPreceding:/nay/,family:'PASS_GAS'},{ifPreceding:/(?:idish|kosacha)ga$/,family:'ADD_SUBSTANCE'}]},
  'kiriting':{ambiguous:true,context:[{ifPreceding:/jadval/,family:'RECORD'},{ifPreceding:/cho‘p|idish/,family:'BRING_NEAR'}]},
  'qizdiring':{family:'HEAT'},'yoqing':{family:'HEAT'},'suyuqlantiring':{family:'HEAT'},'gidrolizlang':{family:'HEAT'},
  'o‘chiring':{family:'STOP_HEAT'},'to‘xtating':{family:'STOP_HEAT'},
  'bug‘lating':{family:'EVAPORATE'},'filtrlang':{family:'FILTER'},'tindiring':{family:'SETTLE'},
  'ajrating':{family:'SEPARATE'},'bo‘ling':{family:'SEPARATE'},
  'aralashtiring':{family:'MIX'},'chayqating':{family:'MIX'},'ishqalang':{family:'MIX'},
  'kechiring':{family:'PASS_GAS'},'loyqalantiring':{family:'PASS_GAS'},
  'o‘tkazing':{ambiguous:true,context:[{ifPreceding:/stakan|idish/,family:'TRANSFER'},{ifPreceding:/dan\b|co2/,family:'PASS_GAS'}]},
  'ko‘chiring':{family:'TRANSFER'},
  'yig‘ing':{ambiguous:true,context:[{ifPreceding:/apparat|asbob|sxema/,family:'SETUP_APPARATUS'},{ifPreceding:/gaz|ammiak|vodorod|kislorod/,family:'COLLECT_GAS'}]},
  'yoping':{family:'SEAL'},'berkiting':{family:'SEAL'},
  'yondiring':{family:'IGNITE'},'yaqinlashtiring':{family:'BRING_NEAR'},'tuting':{ambiguous:true,context:[{ifPreceding:/qiya$/,family:'SETUP_APPARATUS'},{ifPreceding:/ustida|oqimiga|alanga/,family:'BRING_NEAR'}]},
  'ulang':{family:'ELECTRIC_CURRENT'},'uzing':{family:'ELECTRIC_CURRENT'},
  'joylashtiring':{family:'SETUP_APPARATUS'},'mahkamlang':{family:'SETUP_APPARATUS'},'sozlang':{family:'SETUP_APPARATUS'},'moslang':{family:'SETUP_APPARATUS'},
  'qo‘ying':{family:'SETUP_APPARATUS'},'buklang':{family:'SETUP_APPARATUS'},'qirqing':{family:'SETUP_APPARATUS'},'oching':{family:'SETUP_APPARATUS'},
  'kuting':{family:'WAIT'},
  'tekshiring':{family:'TEST'},'aniqlang':{family:'INFER'},'isbotlang':{family:'INFER'},
  'taqqoslang':{family:'COMPARE'},'solishtiring':{family:'COMPARE'},'farqlang':{family:'COMPARE'},
  'yozing':{family:'RECORD'},'ifodalang':{family:'RECORD'},'tuzing':{family:'RECORD'},'nomlang':{family:'RECORD'},'belgilang':{family:'RECORD'},
  'qiling':{ambiguous:true,context:[{ifPreceding:/qayd$/,family:'RECORD'},{ifPreceding:/xulosa$/,family:'INFER'},{ifPreceding:/hosil$/,family:'PREPARE_SUBSTANCE'}]},
  'eting':{ambiguous:true,context:[{ifPreceding:/davom$/,family:'CONTINUE'},{ifPreceding:/qayd$/,family:'RECORD'}]},
  'izohlang':{family:'EXPLAIN'},'tushuntiring':{family:'EXPLAIN'},'ko‘rsating':{family:'EXPLAIN'},
  'bering':{ambiguous:true,context:[{ifPreceding:/e’tibor$/,family:'OBSERVE'},{ifPreceding:/ma’lumot$|javob$|izoh$/,family:'EXPLAIN'}]},
  'oling':{family:'PREPARE_SUBSTANCE'},'tayyorlang':{family:'PREPARE_SUBSTANCE'},
  'yuving':{family:'WASH'},'surting':{family:'WASH'},'namlang':{family:'WASH'},
  'tanlang':{family:'SELECT'},'o‘rganing':{family:'STUDY'},'tanishing':{family:'STUDY'},
  'takrorlang':{family:'REPEAT'},'qaratmang':{family:'SAFETY_PROHIBITION'},'bajaring':{ambiguous:true,context:[]},
});

/** Words ending like an imperative that are NOT verbs (nouns, genitive forms, adverbs). Declared, small, audited. */
const NOT_VERBS=new Set(['rang','so‘ng','teng','ning']);

                                       
              
                                                                                                              
                              
                                                   
 

/** The operations of one instruction step: each imperative verb, in text order. Deterministic; no chemistry. */
export function classifyInstructionStep(text       )                       {
  const words=text.toLowerCase().replace(/[.,;:()«»"!?—–]/g,' ').split(/\s+/).filter(Boolean);
  const out                       =[];
  words.forEach((word,i)=>{
    const rule=INSTRUCTION_VERBS[word];
    // a genitive noun ("…ning") is not a verb, unless the lexicon lists the word (o‘rganing, tanishing)
    if(!rule&&(!/(?:ing|ng)$/.test(word)||word.length<4||NOT_VERBS.has(word)||/ning$/.test(word))) return;
    if(!rule){ out.push({verb:word,family:null,status:'UNMAPPED_OPERATION'}); return; }
    if(!rule.ambiguous){ out.push({verb:word,family:rule.family,status:'MAPPED'}); return; }
    // nearest context first: the object word right before the verb decides before words further back (≤ 8)
    let hit                                   ;
    for(let n=1;n<=Math.min(8,i)&&!hit;n++){ const preceding=words.slice(i-n,i).join(' '); hit=rule.context?.find(c=>c.ifPreceding.test(preceding)); }
    out.push(hit?{verb:word,family:hit.family,status:'MAPPED'}:{verb:word,family:null,status:'AMBIGUOUS'});
  });
  if(!out.length) out.push({verb:'',family:null,status:'UNMAPPED_OPERATION'});
  return out;
}

/** Config action types of the existing runtimes → family (explicit; an unknown type stays unmapped). */
export const CONFIG_ACTION_TYPES                                         =Object.freeze({
  selectApparatus:'SETUP_APPARATUS',addWater:'ADD_SUBSTANCE',addMixture:'ADD_SUBSTANCE',mix:'MIX',filter:'FILTER',evaporate:'EVAPORATE',observe:'OBSERVE',
  selectReagent:'ADD_SUBSTANCE',writeEquation:'RECORD',record:'RECORD',
  connectCurrent:'ELECTRIC_CURRENT',observeCathode:'OBSERVE',observeAnode:'OBSERVE',
  generateEthene:'PREPARE_SUBSTANCE',addBromineWater:'ADD_SUBSTANCE',prepareCuOH2:'PREPARE_SUBSTANCE',addGlycerol:'ADD_SUBSTANCE',
  selectAceticAcid:'SELECT',addIndicator:'ADD_SUBSTANCE',addCarbonate:'ADD_SUBSTANCE',
  mixFatAlkali:'MIX',heat:'HEAT',addCuSO4:'ADD_SUBSTANCE',addNaOH:'ADD_SUBSTANCE',
  selectSalt:'SELECT',predictMedium:'INFER',
});
