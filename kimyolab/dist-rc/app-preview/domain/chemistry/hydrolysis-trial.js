// Hydrolysis prediction trials (P1.5). The ONE place that turns a learner's hydrolysis actions into chemistry
// outcomes. The medium of a salt and the colour of the indicator come from HydrolysisModel (content,
// content-src/chemistry/hydrolysis.json); nothing here invents chemistry — it sequences the learner's choices:
//
//   selectSalt(salt) → predictMedium(medium) → addIndicator → observation (domain) → trial recorded
//
// Pedagogy enforced here, not in the UI:
//  - predict before reveal: a prediction made after the indicator revealed the medium is recorded, but is marked
//    predictedBeforeReveal:false and never earns credit;
//  - a wrong prediction is a recorded trial (evidence), not an error;
//  - an unmodeled salt fails closed: the action is rejected (HYDROLYSIS_NOT_MODELED) and produces no observation;
//  - one trial per salt per attempt (P1.5 closeout): once a salt's medium has been revealed, selecting it again in
//    the same attempt is rejected (HYDROLYSIS_ALREADY_TRIED) — a second "prediction" would only copy the answer.
//    Evidence per attempt is therefore bounded by the number of modeled salts (no inflation by repetition);
//    a real second try is a new attempt (retry).
import {HYDROLYSIS_MEDIA,                                                              } from './hydrolysis-model.js';

                             
                                             
                                                            
                          

                                                                                                                                                                                                       

                                                                                                          

                                  
           
                      
                                   
                                
                   
                                
                                                  
                  
                                                                               
                                
 

                                       
                                                                              
                 
                                                          
                    
                                                                                                                                  
                                                                                                      
                       
                           
                                                                                           
                      
                                                                              
                                    
                                                                                                
                   
 

const isMedium=(m        )                      =>HYDROLYSIS_MEDIA.includes(m                    );

/** Validates the activity against the domain: the target salt is modeled and its expected medium matches. */
export function assertHydrolysisTarget(model                ,targetSalt       ,expectedMedium        )                 {
  const r=model.classify(targetSalt);
  if(!r.modeled) throw new Error(`HYDROLYSIS_NOT_MODELED:${targetSalt}`);
  if(expectedMedium!==undefined&&expectedMedium!==r.medium) throw new Error(`HYDROLYSIS_CONFIG_MISMATCH:${targetSalt}`);
  return r.medium;
}

export function evaluateHydrolysisTrials(model                ,targetSalt       ,actions                   )                     {
  assertHydrolysisTarget(model,targetSalt);
  const trials                  =[];
  let current                                ={selectedSalt:null,predictedMedium:null,revealed:false,observation:null,trial:null};
  let rejected                         =null;
  let recorded=false;          // the current trial is already in `trials`
  const tried=new Set        ();
  const record=(predictedMedium                 ,predictedBeforeReveal        )=>{
    const o=current.observation ;
    trials.push({n:trials.length+1,selectedSalt:current.selectedSalt ,predictedMedium,actualMedium:o.medium,indicator:o.indicator,indicatorColor:o.color,correct:predictedMedium===o.medium,predictedBeforeReveal});
    recorded=true; current={...current,trial:trials.length};
  };
  for(const raw of actions){
    const a=raw                                ;
    rejected=null;
    if(a?.type==='selectSalt'){
      const salt=a.payload?.salt;
      if(typeof salt!=='string'||!model.classify(salt).modeled){ rejected='HYDROLYSIS_NOT_MODELED'; continue; }
      if(tried.has(salt)){ rejected='HYDROLYSIS_ALREADY_TRIED'; continue; }
      current={selectedSalt:salt,predictedMedium:null,revealed:false,observation:null,trial:null}; recorded=false;
    }else if(a?.type==='predictMedium'){
      const medium=a.payload?.medium;
      if(!isMedium(medium)){ rejected='HYDROLYSIS_ACTION_INVALID'; continue; }
      if(!current.selectedSalt){ rejected='HYDROLYSIS_NO_SALT'; continue; }
      if(recorded){ rejected='HYDROLYSIS_PREDICTION_LOCKED'; continue; }
      current={...current,predictedMedium:medium};
      if(current.revealed) record(medium,false);           // late prediction: kept as evidence, no credit
    }else if(a?.type==='addIndicator'){
      if(!current.selectedSalt){ rejected='HYDROLYSIS_NO_SALT'; continue; }
      if(current.revealed) continue;                       // the indicator is already in: idempotent
      const r=model.classify(current.selectedSalt);
      if(!r.modeled){ rejected='HYDROLYSIS_NOT_MODELED'; continue; }
      const c=model.indicatorColor(r.medium);
      if(!c.modeled){ rejected='HYDROLYSIS_INDICATOR_NOT_MODELED'; continue; }
      current={...current,revealed:true,observation:{medium:r.medium,indicator:c.indicator,color:c.color}};
      tried.add(current.selectedSalt );
      if(current.predictedMedium) record(current.predictedMedium,true);
    }else{
      rejected='HYDROLYSIS_ACTION_INVALID';
    }
  }
  return {
    salts:model.salts(),targetSalt,current,trials,triedSalts:[...tried],rejected,
    achieved:trials.some(t=>t.selectedSalt===targetSalt&&t.predictedBeforeReveal&&t.correct),
  };
}
