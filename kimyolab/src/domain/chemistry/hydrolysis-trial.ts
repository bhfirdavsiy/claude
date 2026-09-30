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
//  - an unmodeled salt fails closed: the action is rejected (HYDROLYSIS_NOT_MODELED) and produces no observation.
import {HYDROLYSIS_MEDIA,type HydrolysisMedium,type HydrolysisModel,type IndicatorColor} from './hydrolysis-model.ts';

export type HydrolysisAction=
  | {type:'selectSalt';payload:{salt:string}}
  | {type:'predictMedium';payload:{medium:HydrolysisMedium}}
  | {type:'addIndicator'};

export type HydrolysisRejection='HYDROLYSIS_NOT_MODELED'|'HYDROLYSIS_ACTION_INVALID'|'HYDROLYSIS_NO_SALT'|'HYDROLYSIS_PREDICTION_LOCKED'|'HYDROLYSIS_INDICATOR_NOT_MODELED';

export interface HydrolysisObservation { medium:HydrolysisMedium; indicator:string; color:IndicatorColor }

export interface HydrolysisTrial {
  n:number;
  selectedSalt:string;
  predictedMedium:HydrolysisMedium;
  actualMedium:HydrolysisMedium;
  indicator:string;
  indicatorColor:IndicatorColor;
  /** predictedMedium === actualMedium (domain) */
  correct:boolean;
  /** false → the prediction came after the reveal: recorded, never credited */
  predictedBeforeReveal:boolean;
}

export interface HydrolysisTrialState {
  /** the modeled salts, from content — the only salts a learner can choose */
  salts:string[];
  /** the salt the activity asks about (content config) */
  targetSalt:string;
  current:{selectedSalt:string|null;predictedMedium:HydrolysisMedium|null;revealed:boolean;observation:HydrolysisObservation|null;
    /** n of the recorded trial of this selection, once it has both a prediction and an observation */
    trial:number|null};
  trials:HydrolysisTrial[];
  /** the last action, if it was rejected (fail closed: it changed nothing) */
  rejected:HydrolysisRejection|null;
  /** a credited trial on the target salt: selected, predicted BEFORE the reveal, and correct */
  achieved:boolean;
}

const isMedium=(m:unknown):m is HydrolysisMedium=>HYDROLYSIS_MEDIA.includes(m as HydrolysisMedium);

/** Validates the activity against the domain: the target salt is modeled and its expected medium matches. */
export function assertHydrolysisTarget(model:HydrolysisModel,targetSalt:string,expectedMedium?:string):HydrolysisMedium{
  const r=model.classify(targetSalt);
  if(!r.modeled) throw new Error(`HYDROLYSIS_NOT_MODELED:${targetSalt}`);
  if(expectedMedium!==undefined&&expectedMedium!==r.medium) throw new Error(`HYDROLYSIS_CONFIG_MISMATCH:${targetSalt}`);
  return r.medium;
}

export function evaluateHydrolysisTrials(model:HydrolysisModel,targetSalt:string,actions:readonly unknown[]):HydrolysisTrialState{
  assertHydrolysisTarget(model,targetSalt);
  const trials:HydrolysisTrial[]=[];
  let current:HydrolysisTrialState['current']={selectedSalt:null,predictedMedium:null,revealed:false,observation:null,trial:null};
  let rejected:HydrolysisRejection|null=null;
  let recorded=false;          // the current trial is already in `trials`
  const record=(predictedMedium:HydrolysisMedium,predictedBeforeReveal:boolean)=>{
    const o=current.observation!;
    trials.push({n:trials.length+1,selectedSalt:current.selectedSalt!,predictedMedium,actualMedium:o.medium,indicator:o.indicator,indicatorColor:o.color,correct:predictedMedium===o.medium,predictedBeforeReveal});
    recorded=true; current={...current,trial:trials.length};
  };
  for(const raw of actions){
    const a=raw as {type?:unknown;payload?:any};
    rejected=null;
    if(a?.type==='selectSalt'){
      const salt=a.payload?.salt;
      if(typeof salt!=='string'||!model.classify(salt).modeled){ rejected='HYDROLYSIS_NOT_MODELED'; continue; }
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
      if(current.predictedMedium) record(current.predictedMedium,true);
    }else{
      rejected='HYDROLYSIS_ACTION_INVALID';
    }
  }
  return {
    salts:model.salts(),targetSalt,current,trials,rejected,
    achieved:trials.some(t=>t.selectedSalt===targetSalt&&t.predictedBeforeReveal&&t.correct),
  };
}
