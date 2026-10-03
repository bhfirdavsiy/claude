// P2.11 — the capability registry (ADR-P2-012): what KimyoLab can actually execute, DERIVED from the existing
// contracts and engine data — never a second hand-written list.
//
//   actions      ← LAB_ACTION_FAMILIES (kind, domainHandler, checker, apparatus) + HANDLER_SEMANTICS (the runtime's own
//                  declaration of what each handler is and which authorities it may consult)
//   authorities  ← the engine data: ReactionMatcher records (reactants, products, condition dimensions, observation
//                  kinds), IonicEngine dissociation rules, ElectrolysisModel records, school lab models (step-bound),
//                  qualitative tests
//   species      ← SpeciesRegistry, each formula with the authorities that know it
//
// It answers the future Content Studio question
//   instruction operation → supported capability → runtime authority
// without anyone choosing an engine: resolveOperation() picks the authority from the data, or says why none applies.
import {familyKind,LAB_ACTION_FAMILIES,                                                                    } from './action-catalog.js';
import {HANDLER_SEMANTICS,                } from './lab-runtime.js';
import {parseConditionVocabulary} from '../chemistry/condition-vocabulary.js';

export const CAPABILITY_REGISTRY_SCHEMA='kimyolab.capability-registry.v1';
/** bump on any change of the registry's shape or of how a capability is resolved */
export const CAPABILITY_REGISTRY_VERSION='1.0.0';

                                                                                                                                              
                             
                                                                                              
                                                                             
                                                                                                                          
                                                                                                            
                                                                                                                
                                                                       
                                                                                             
                                                  

                               
                                                                                   
                                                                                    
 

                                   
                                                
                             
                       
                        
                      
                                 
                                                                                                    
                                       
 

                                     
                                           
                                             
                             
               
                                                                                                                                                                                                                          
                                                                           
                                                                                                                         
                                                             
                                                                        
    
                                                                                               
 

const arr=(v    ,key       )      =>Array.isArray(v)?v:Array.isArray(v?.[key])?v[key]:[];
const uniq=(xs         )=>[...new Set(xs)].sort((a,b)=>a.localeCompare(b,'en'));

export function buildCapabilityRegistry(data             )                   {
  const reactions=arr(data.reactions,'reactions');
  const rules=data.solutionRules       ;
  const electro=arr(data.electrolysis,'records');
  const school=arr(data.schoolLabModels,'models');
  const qual=arr(data.qualitativeTests,'tests');
  const species=arr(data.species,'species');
  const vocabulary=data.conditionVocabulary?parseConditionVocabulary(data.conditionVocabulary):undefined;
  const rmFormulas=uniq(reactions.flatMap((r    )=>[...r.reactants,...r.products].map((x    )=>x.formula)));
  const dims=uniq(reactions.flatMap((r    )=>(r.conditions?.tags??[]).map((t       )=>vocabulary?.terms[t]?.dimension??`unknown:${t}`)));
  const ionicFormulas=uniq((rules?.dissociation??[]).map((d    )=>d.formula));
  const insoluble=uniq(rules?.insoluble??[]);
  const electrolytes=uniq(electro.map((r    )=>r.electrolyte));
  const qualFormulas=uniq(qual.flatMap((t    )=>[t.reagent,t.product,...(t.supportedSamples??[])]));
  const actions                   =LAB_ACTION_FAMILIES.map(d=>{
    const sem=HANDLER_SEMANTICS[d.family];
    return {family:d.family,kind:d.kind,handler:d.domainHandler&&sem?sem.type:'NONE',authorities:sem?.authorities??[],procedureOnly:Boolean(d.domainHandler&&sem?.type==='PROCEDURE'&&!sem.authorities.some(a=>a!=='INSTRUCTION_TEXT')),checker:d.checker,apparatusRequirements:[...d.apparatusRequirements],requiresProfileAuthority:sem?.requiresProfileAuthority??null};
  });
  return {
    schema:CAPABILITY_REGISTRY_SCHEMA,version:CAPABILITY_REGISTRY_VERSION,actions,
    authorities:{
      ReactionMatcher:{records:reactions.length,reactionIds:uniq(reactions.map((r    )=>r.id)),formulas:rmFormulas,reactantSets:reactions.map((r    )=>({reactionId:r.id,reactants:uniq(r.reactants.map((x    )=>x.formula)),conditionTags:[...(r.conditions?.tags??[])]})).sort((a    ,b    )=>a.reactionId.localeCompare(b.reactionId,'en')),conditionDimensions:dims,modelObservationKinds:uniq(reactions.flatMap((r    )=>(r.observations??[]).map((o    )=>o.type)))},
      IonicEngine:{dissociationFormulas:ionicFormulas,insolubleFormulas:insoluble},
      ElectrolysisModel:{queries:electro.map((r    )=>({electrolyte:r.electrolyte,phase:r.phase,electrode:r.electrode})),modelObservationKinds:electro.length?['deposit','gas']:[]},
      SchoolLabModel:{models:uniq(school.map((m    )=>m.id)),scope:'STEP_BOUND_ONLY'},
      QualitativeTest:{tests:uniq(qual.map((t    )=>t.id)),reagents:uniq(qual.map((t    )=>t.reagent)),samples:uniq(qual.flatMap((t    )=>t.supportedSamples??[]))},
    },
    species:species.map((s    )=>{
      const auth              =[];
      if(rmFormulas.includes(s.formula)) auth.push('ReactionMatcher');
      if(ionicFormulas.includes(s.formula)||insoluble.includes(s.formula)) auth.push('IonicEngine');
      if(electrolytes.includes(s.formula)) auth.push('ElectrolysisModel');
      if(qualFormulas.includes(s.formula)) auth.push('QualitativeTest');
      return {speciesId:s.id,formula:s.formula,phase:s.phase??null,authorities:auth};
    }).sort((a    ,b    )=>a.speciesId.localeCompare(b.speciesId,'en')),
  };
}

/** formula → the species and the authorities that know it (unknown stays explicit, never guessed) */
export function resolveSubstance(registry                   ,formula       ){
  const hits=registry.species.filter(s=>s.formula===formula);
  return {formula,speciesId:hits.length===1?hits[0] .speciesId:null,ambiguous:hits.length>1,authorities:uniq(hits.flatMap(h=>h.authorities))                 ,status:hits.length?'KNOWN':'UNKNOWN_SUBSTANCE'};
}

/** instruction operation (+ the formulas it involves) → capability status and the authority that would run it. */
export function resolveOperation(registry                   ,op                                             ,formulas         =[])                                                                                          {
  if(op.status==='AMBIGUOUS') return {status:'AMBIGUOUS',family:null,authority:null,reason:'no context rule resolved the verb'};
  if(op.status==='UNMAPPED_OPERATION'||!op.family) return {status:'UNMAPPED',family:null,authority:null,reason:'verb not in the lexicon'};
  const kind=familyKind(op.family);
  if(kind==='LEARNER_RESPONSE') { const a=registry.actions.find(x=>x.family===op.family) ; return {status:'LEARNER_RESPONSE',family:op.family,authority:a.checker?'checker':null,reason:a.checker?`checker: ${a.checker}`:'no checker: never judged'}; }
  if(kind==='CONTROL') return {status:'CONTROL',family:op.family,authority:null,reason:'lab-level control'};
  if(kind==='SAFETY_RULE') return {status:'SAFETY_RULE',family:op.family,authority:null,reason:'a prohibition, carried as a safety note'};
  const a=registry.actions.find(x=>x.family===op.family) ;
  if(a.handler==='NONE') return {status:'UNSUPPORTED_ACTION',family:op.family,authority:null,reason:'no safe handler'};
  if(a.procedureOnly) return {status:'PROCEDURE_ONLY',family:op.family,authority:'PROCEDURE',reason:'deterministic procedure; no chemistry decided'};
  // a chemistry handler: the first of its authorities that knows every formula involved
  const chem=a.authorities.filter(x=>x!=='INSTRUCTION_TEXT');
  if(!formulas.length) return {status:'AUTHORITY_AT_RUNTIME',family:op.family,authority:chem.join('|')||'PROCEDURE',reason:`handler exists; no formula in the step, so the authority is chosen from the substances at run time (not verified here)${a.requiresProfileAuthority?` (only under a ${a.requiresProfileAuthority} profile; elsewhere it fails closed)`:''}`};
  for(const auth of chem){
    // ReactionMatcher answers for a COMBINATION: a record with exactly these reactants (its conditions are checked at
    // run time against the actual lab conditions); knowing each formula separately is not enough
    if(auth==='ReactionMatcher'&&formulas.length>1){
      const key=uniq(formulas).join('+');
      const hits=registry.authorities.ReactionMatcher.reactantSets.filter(r=>r.reactants.join('+')===key);
      if(hits.length) return {status:'SUPPORTED',family:op.family,authority:auth,reason:`record ${hits.map(h=>h.reactionId).join(', ')}${hits.some(h=>h.conditionTags.length)?` (requires: ${uniq(hits.flatMap(h=>h.conditionTags)).join(', ')})`:''}`};
      continue;
    }
    const knows=(f       )=>registry.species.some(s=>s.formula===f&&s.authorities.includes(auth               ));
    if(formulas.every(knows)) return {status:'SUPPORTED',family:op.family,authority:auth,reason:`${auth} knows ${formulas.join(', ')}`};
  }
  return {status:'AUTHORITY_REQUIRED',family:op.family,authority:null,reason:`no authority of this handler covers ${formulas.join(' + ')} (fails closed)`};
}

/** registry ↔ runtime consistency: every implemented family declares its semantics and vice versa */
export function registryProblems(registry                   )         {
  const out         =[];
  for(const d of LAB_ACTION_FAMILIES){
    const sem=HANDLER_SEMANTICS[d.family];
    if(d.domainHandler&&!sem) out.push(`HANDLER_WITHOUT_SEMANTICS:${d.family}`);
    if(!d.domainHandler&&sem) out.push(`SEMANTICS_WITHOUT_HANDLER:${d.family}`);
  }
  if(registry.version!==CAPABILITY_REGISTRY_VERSION) out.push('VERSION');
  return out;
}
