// Condition → outcome prediction trials (P2.6, ADR-P2-007). The ONE place that turns a learner's choices about a
// modeled CONDITION (an equilibrium perturbation, a reaction medium …) into domain outcomes. Every outcome comes from an
// existing domain model through a ConditionModel adapter (EquilibriumModel, ManganeseRedoxModel); nothing here invents
// chemistry — it sequences the learner's choices:
//
//   selectCondition(c) → predictOutcome(o) → reveal → outcome (domain) → trial recorded
//
// Pedagogy enforced here, not in the UI:
//  - predict before reveal: reveal needs a prediction, and a prediction after the reveal is REJECTED (no late answers;
//    so every recorded trial is a genuine prediction and plain answer evidence needs no special scoring rule);
//  - a wrong prediction is a recorded trial (evidence), not an error;
//  - an unmodeled condition or an outcome outside the model's closed option set fails closed (rejected, no state);
//  - one trial per condition per attempt: a revealed condition cannot be chosen again in the same attempt (a second
//    "prediction" would only copy the revealed answer); a real second try is a new attempt (retry).

/** A domain model seen as condition → outcome. Adapters only wrap existing models; they add no records. */
                                 
                                                                            
              
                                                                                      
                        
                                                                                             
                      
                                                                                      
 

                            
                                                       
                                                    
                    

                                                                                                                                
                                                                        

                                                                                                                

                                      
              
                      
                          
                                                               
                         
                                                                                                               
                          
                           
                                   
                                                                                                              
                   
 

/** The activity's target must be a modeled condition (content errors fail closed at evaluation). */
export function assertConditionTarget(model               ,targetCondition       ){
  if(!model.conditions().includes(targetCondition)||!model.resolve(targetCondition).modeled) throw new Error(`CONDITION_TARGET_NOT_MODELED:${model.kind}:${targetCondition}`);
}

export function evaluateConditionTrials(model               ,targetCondition       ,actions                   )                    {
  assertConditionTarget(model,targetCondition);
  const conditions=model.conditions(), outcomes=model.outcomes();
  const trials                 =[]; const tried=new Set        ();
  let current                               ={condition:null,predicted:null,revealed:false,outcome:null,trial:null};
  let rejected                        =null;
  for(const raw of actions){
    const a=raw                                ;
    rejected=null;
    if(a?.type==='selectCondition'){
      const c=a.payload?.condition;
      if(typeof c!=='string'||!conditions.includes(c)||!model.resolve(c).modeled){ rejected='CONDITION_NOT_MODELED'; continue; }
      if(tried.has(c)){ rejected='CONDITION_ALREADY_TRIED'; continue; }
      current={condition:c,predicted:null,revealed:false,outcome:null,trial:null};
    }else if(a?.type==='predictOutcome'){
      const o=a.payload?.outcome;
      if(typeof o!=='string'||!outcomes.includes(o)){ rejected='OUTCOME_NOT_IN_MODEL'; continue; }
      if(!current.condition){ rejected='CONDITION_NO_SELECTION'; continue; }
      if(current.revealed){ rejected='PREDICTION_LOCKED'; continue; }
      current={...current,predicted:o};
    }else if(a?.type==='reveal'){
      if(!current.condition){ rejected='CONDITION_NO_SELECTION'; continue; }
      if(current.revealed) continue;                                  // already revealed: idempotent
      if(!current.predicted){ rejected='PREDICTION_REQUIRED'; continue; }
      const r=model.resolve(current.condition);
      if(!r.modeled){ rejected='CONDITION_NOT_MODELED'; continue; }
      trials.push({n:trials.length+1,condition:current.condition,predicted:current.predicted,actual:r.outcome,correct:current.predicted===r.outcome});
      tried.add(current.condition);
      current={...current,revealed:true,outcome:r.outcome,trial:trials.length};
    }else{
      rejected='CONDITION_ACTION_INVALID';
    }
  }
  return {kind:model.kind,conditions,outcomeOptions:outcomes,targetCondition,current,trials,triedConditions:[...tried],rejected,
    achieved:trials.some(t=>t.condition===targetCondition&&t.correct)};
}

// ------------------------------------------------------------------------------------------------ adapters
// Structural types keep this module free of model imports (no cycles); the models' own methods do the work.
                                                                                                                                                                
                                                                           

/** Equilibrium: perturbations of ONE reaction system (the activity's) → the modeled shift. */
export function equilibriumConditionModel(model                ,reactionId       ,shifts                  )               {
  return {kind:'equilibrium-shift',conditions:()=>model.cases(reactionId),outcomes:()=>[...shifts],
    resolve:(p)=>{ const r=model.resolve(reactionId,p); return r.modeled?{modeled:true,outcome:r.shift}:{modeled:false,code:r.code}; }};
}

/** Manganese redox: the reaction medium → the modeled product. The option set is the model's own product list. */
export function manganeseConditionModel(model              )               {
  const media=model.media();
  return {kind:'manganese-medium-product',conditions:()=>[...media],outcomes:()=>[...new Set(media.map(m=>model.resolve(m).product))].sort(),
    resolve:(m)=>media.includes(m)?{modeled:true,outcome:model.resolve(m).product}:{modeled:false,code:'MANGANESE_MEDIUM_NOT_MODELED'}};
}
