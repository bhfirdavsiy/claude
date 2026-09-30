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
import type {Observation} from './types.ts';
import type {IonicEngine} from './ionic-engine.ts';
import {classifyMatch,type ReactionMatcher} from './reaction-matcher.ts';
import type {SpeciesRegistry} from './species-registry.ts';
import {compareNetIonic,sameSubmission} from './ionic-equation.ts';

export type Slot='A'|'B';
export type IonicAction=
  | {type:'selectReagent';payload:{slot:Slot;speciesId:string}}
  | {type:'mix'}
  | {type:'writeEquation';payload:{equation:string}};

export type IonicRejection=
  | 'REAGENT_NOT_AVAILABLE'|'MIX_INCOMPLETE'|'MIX_SAME_REAGENT'
  | 'EQUATION_NO_REACTION'|'EQUATION_SYNTAX'|'EQUATION_ALREADY_SOLVED'|'EQUATION_UNCHANGED'|'IONIC_ACTION_INVALID';

export interface Reagent { speciesId:string; formula:string }
export type MixOutcome='reaction'|'no-reaction'|'not-modeled';
export interface MixResult {
  n:number;
  /** speciesIds in slot order (A, B) */
  reagents:[string,string];
  outcome:MixOutcome;
  reactionId:string|null;
  /** from the KB record; null when not modeled */
  observations:Observation[]|null;
  /** REACTION_NOT_MODELED / REACTION_CONDITION_REQUIRED when not modeled */
  coverageCode:string|null;
}
/** the expected equation is NOT kept in the state (it never reaches the renderer model); evidence records it */
export interface EquationAttempt { n:number; reactionId:string; response:string; correct:boolean }

export interface IonicMixingState {
  /** the shelf, in content order — the only reagents the learner can choose */
  reagents:Reagent[];
  selected:Record<Slot,string|null>;
  /** the mix of the current selection, or null (not mixed yet / selection changed) */
  current:MixResult|null;
  /** every distinct pair mixed in this attempt (one record per pair) */
  mixes:MixResult[];
  equations:EquationAttempt[];
  /** reactions whose net ionic equation the learner has written correctly */
  solved:string[];
  rejected:IonicRejection|null;
  /** the syntax problem of the last rejected equation (for help text), never a chemistry verdict */
  syntaxReason:string|null;
  /** the target reaction was observed AND its net ionic equation written correctly */
  achieved:boolean;
}

export interface IonicDomain { species:SpeciesRegistry; matcher:ReactionMatcher; ionic:IonicEngine }

/** Validates the shelf and the target against the domain (content errors fail closed). */
export function resolveShelf(d:IonicDomain,speciesIds:readonly string[],targetReactionId:string):Reagent[]{
  if(!Array.isArray(speciesIds)||speciesIds.length<2) throw new Error('IONIC_SHELF_INVALID:size');
  const reagents=speciesIds.map(id=>{
    const s=d.species.byId(id);
    if(!s) throw new Error(`IONIC_SHELF_INVALID:${id}`);
    if(!d.ionic.dissociate(s.formula).modeled) throw new Error(`IONIC_SHELF_NOT_SOLUTION:${id}`);
    return {speciesId:id,formula:s.formula};
  });
  if(new Set(reagents.map(r=>r.speciesId)).size!==reagents.length) throw new Error('IONIC_SHELF_INVALID:duplicate');
  // the target reaction must be modeled, a real reaction, and reachable from the shelf
  let expected:string;
  try{ expected=d.ionic.netIonicEquation(targetReactionId).equation; }catch{ throw new Error(`IONIC_TARGET_INVALID:${targetReactionId}`); }
  if(!expected) throw new Error(`IONIC_TARGET_INVALID:${targetReactionId}`);
  const reachable=reagents.some(a=>reagents.some(b=>a!==b&&(()=>{const m=d.matcher.match({reactants:[{formula:a.formula,phase:'aq'},{formula:b.formula,phase:'aq'}],conditionPolicy:'require-record-conditions'});return m.modeled&&m.reaction.id===targetReactionId;})()));
  if(!reachable) throw new Error(`IONIC_TARGET_UNREACHABLE:${targetReactionId}`);
  return reagents;
}

export function evaluateIonicMixing(d:IonicDomain,input:{shelf:readonly string[];targetReactionId:string;actions:readonly unknown[]}):IonicMixingState{
  const reagents=resolveShelf(d,input.shelf,input.targetReactionId);
  const byId=new Map(reagents.map(r=>[r.speciesId,r]));
  const selected:Record<Slot,string|null>={A:null,B:null};
  let current:MixResult|null=null;
  const mixes:MixResult[]=[];
  const equations:EquationAttempt[]=[];
  const solved=new Set<string>();
  let rejected:IonicRejection|null=null, syntaxReason:string|null=null;
  const pairKey=(a:string,b:string)=>[a,b].sort().join('+');
  for(const raw of input.actions){
    const a=raw as {type?:unknown;payload?:any};
    rejected=null; syntaxReason=null;
    if(a?.type==='selectReagent'){
      const slot=a.payload?.slot, id=a.payload?.speciesId;
      if((slot!=='A'&&slot!=='B')||typeof id!=='string'){ rejected='IONIC_ACTION_INVALID'; continue; }
      if(!byId.has(id)){ rejected='REAGENT_NOT_AVAILABLE'; continue; }
      if(selected[slot as Slot]!==id){ selected[slot as Slot]=id; current=null; }
    }else if(a?.type==='mix'){
      if(!selected.A||!selected.B){ rejected='MIX_INCOMPLETE'; continue; }
      if(selected.A===selected.B){ rejected='MIX_SAME_REAGENT'; continue; }
      const key=pairKey(selected.A,selected.B);
      const seen=mixes.find(m=>pairKey(m.reagents[0],m.reagents[1])===key);
      if(seen){ current=seen; continue; }                       // mixing the same pair again adds nothing
      const A=byId.get(selected.A)!, B=byId.get(selected.B)!;
      // mixing two solutions at room temperature: records that need heating, concentrated acid, current or light
      // do not apply (REACTION_CONDITIONS_NOT_MET → not modeled for this situation)
      const m=d.matcher.match({reactants:[{formula:A.formula,phase:'aq'},{formula:B.formula,phase:'aq'}],conditionPolicy:'require-record-conditions'});
      const cls=classifyMatch(m);
      const result:MixResult=m.modeled
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
      const previous=[...equations].reverse().find(e=>e.reactionId===current!.reactionId);
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
