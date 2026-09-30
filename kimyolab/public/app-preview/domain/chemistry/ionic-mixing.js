// Ionic precipitation / ion-exchange mixing (P1.6). The ONE place that turns a learner's reagent choices into
// chemistry outcomes. Authorities (nothing here invents chemistry):
//   - which reagents exist and their formulas     → SpeciesRegistry (species.json)
//   - which reagents are solutions (ions)          → IonicEngine.dissociate (solubility.json)
//   - what happens when two reagents are mixed     → ReactionMatcher (reactions.json)
//   - the expected net ionic equation              → IonicEngine.netIonicEquation
//   - whether the learner's equation is the same   → compareNetIonic (ionic-equation.ts)
//
//   selectReagent(A|B, speciesId) → selectReagent(…) → mix → observation (domain) → writeEquation(text)
//
// Three different mixing outcomes, never conflated:
//   'reaction'     — a modeled reaction (its observations come from the KB record);
//   'no-reaction'  — an EXPLICIT modeled record saying these reagents do not react (reactionType 'no-reaction');
//   'not-modeled'  — the KB has no record for these reagents under these conditions (REACTION_NOT_MODELED,
//                    REACTION_CONDITIONS_NOT_MET: the record needs heating/concentrated acid/…,
//                    REACTION_CONDITION_REQUIRED: ambiguous). This is a model
//                    coverage gap: no observation is invented, it is never reported as "no reaction" and it is
//                    not chemistry evidence about the learner.
                                                               
                                                   
import {classifyMatch,                    } from './reaction-matcher.js';
                                                           
import {compareNetIonic,sameSubmission} from './ionic-equation.js';

                         
                        
                                                               
                
                                                     

                           
                                                               
                                                                                                                   

/** nameKey: the species' localization key (display name lives in locale content, never in the domain) */
                                                                                  
                                                              
                            
           
                                        
                           
                     
                         
                                                  
                                  
                                                                            
                           
 
/** the expected equation is NOT kept in the state (it never reaches the renderer model); evidence records it */
                                                                                                  

                                   
                                                                               
                     
                                    
                                                                                      
                         
                                                                        
                    
                              
                                                                             
                  
                               
                                                                                                    
                           
                                                                                      
                   
 

                              
                                                                      
                                                                                                                    
                                                                                               
                                       
 

/** Validates the shelf and the target against the domain (content errors fail closed). */
export function resolveShelf(d            ,speciesIds                  ,targetReactionId       )          {
  if(!Array.isArray(speciesIds)||speciesIds.length<2) throw new Error('IONIC_SHELF_INVALID:size');
  const reagents=speciesIds.map(id=>{
    const s=d.species.byId(id);
    if(!s) throw new Error(`IONIC_SHELF_INVALID:${id}`);
    if(!d.ionic.dissociate(s.formula).modeled) throw new Error(`IONIC_SHELF_NOT_SOLUTION:${id}`);
    return {speciesId:id,formula:s.formula,nameKey:typeof (s       ).nameKey==='string'?(s       ).nameKey:null};
  });
  if(new Set(reagents.map(r=>r.speciesId)).size!==reagents.length) throw new Error('IONIC_SHELF_INVALID:duplicate');
  // the target reaction must be modeled, a real reaction, and reachable from the shelf
  let expected       ;
  try{ expected=d.ionic.netIonicEquation(targetReactionId).equation; }catch{ throw new Error(`IONIC_TARGET_INVALID:${targetReactionId}`); }
  if(!expected) throw new Error(`IONIC_TARGET_INVALID:${targetReactionId}`);
  const reachable=reagents.some(a=>reagents.some(b=>a!==b&&(()=>{const m=d.matcher.match({reactants:[{formula:a.formula,phase:'aq'},{formula:b.formula,phase:'aq'}],conditions:d.mixingConditions??{},conditionPolicy:'require-record-conditions'});return m.modeled&&m.reaction.id===targetReactionId;})()));
  if(!reachable) throw new Error(`IONIC_TARGET_UNREACHABLE:${targetReactionId}`);
  return reagents;
}

export function evaluateIonicMixing(d            ,input                                                                             )                 {
  const reagents=resolveShelf(d,input.shelf,input.targetReactionId);
  const byId=new Map(reagents.map(r=>[r.speciesId,r]));
  const selected                         ={A:null,B:null};
  let current               =null;
  const mixes            =[];
  const equations                  =[];
  const solved=new Set        ();
  let rejected                    =null, syntaxReason            =null;
  const pairKey=(a       ,b       )=>[a,b].sort().join('+');
  for(const raw of input.actions){
    const a=raw                                ;
    rejected=null; syntaxReason=null;
    if(a?.type==='selectReagent'){
      const slot=a.payload?.slot, id=a.payload?.speciesId;
      if((slot!=='A'&&slot!=='B')||typeof id!=='string'){ rejected='IONIC_ACTION_INVALID'; continue; }
      if(!byId.has(id)){ rejected='REAGENT_NOT_AVAILABLE'; continue; }
      if(selected[slot        ]!==id){ selected[slot        ]=id; current=null; }
    }else if(a?.type==='mix'){
      if(!selected.A||!selected.B){ rejected='MIX_INCOMPLETE'; continue; }
      if(selected.A===selected.B){ rejected='MIX_SAME_REAGENT'; continue; }
      const key=pairKey(selected.A,selected.B);
      const seen=mixes.find(m=>pairKey(m.reagents[0],m.reagents[1])===key);
      if(seen){ current=seen; continue; }                       // mixing the same pair again adds nothing
      const A=byId.get(selected.A) , B=byId.get(selected.B) ;
      // mixing two solutions at room temperature: records that need heating, concentrated acid, current or light
      // do not apply (REACTION_CONDITIONS_NOT_MET → not modeled for this situation)
      const m=d.matcher.match({reactants:[{formula:A.formula,phase:'aq'},{formula:B.formula,phase:'aq'}],conditions:d.mixingConditions??{},conditionPolicy:'require-record-conditions'});
      const cls=classifyMatch(m);
      const result          =m.modeled
        ?{n:mixes.length+1,reagents:[A.speciesId,B.speciesId],outcome:cls==='MODELED_NO_REACTION'?'no-reaction':'reaction',reactionId:m.reaction.id,observations:(m.reaction.observations??[]).map(o=>({...o})),coverageCode:null}
        :{n:mixes.length+1,reagents:[A.speciesId,B.speciesId],outcome:'not-modeled',reactionId:null,observations:null,coverageCode:m.code};
      mixes.push(result); current=result;
    }else if(a?.type==='writeEquation'){
      if(!current||current.outcome!=='reaction'||!current.reactionId){ rejected='EQUATION_NO_REACTION'; continue; }
      if(solved.has(current.reactionId)){ rejected='EQUATION_ALREADY_SOLVED'; continue; }
      const response=String(a.payload?.equation??'');
      const expected=d.ionic.netIonicEquation(current.reactionId).equation;
      const verdict=compareNetIonic(response,expected);
      if(verdict.syntax==='error'){ rejected='EQUATION_SYNTAX'; syntaxReason=verdict.reason; continue; }
      // P1.6 closeout: re-submitting the same equation (equivalent to the previous answer for this reaction) is not
      // a new revision — it adds no evidence (no inflation by repetition)
      const previous=[...equations].reverse().find(e=>e.reactionId===current .reactionId);
      if(previous&&sameSubmission(response,previous.response)){ rejected='EQUATION_UNCHANGED'; continue; }
      equations.push({n:equations.length+1,reactionId:current.reactionId,response:response.trim(),correct:verdict.correct});
      if(verdict.correct) solved.add(current.reactionId);
    }else{
      rejected='IONIC_ACTION_INVALID';
    }
  }
  const observedTarget=mixes.some(m=>m.outcome==='reaction'&&m.reactionId===input.targetReactionId);
  return {reagents,selected,current,mixes,equations,solved:[...solved],rejected,syntaxReason,achieved:observedTarget&&solved.has(input.targetReactionId)};
}
