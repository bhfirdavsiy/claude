import type { Phase, ReactionConditions, ReactionRecord, ReactionSpeciesRef } from './types.ts';
export type ReactantQuery=string|{formula:string;phase?:Phase};
export type ReactionMatchResult={modeled:true;reaction:ReactionRecord}|{modeled:false;code:'REACTION_NOT_MODELED'|'REACTION_CONDITION_REQUIRED'};

function formula(x:ReactantQuery){return typeof x==='string'?x:x.formula}
function phasesCompatible(query:ReactantQuery[], refs:ReactionSpeciesRef[]):boolean{
  const pool=[...refs];
  for(const q of query){
    const idx=pool.findIndex(r=>r.formula===formula(q) && (typeof q==='string'||!q.phase||!r.phase||q.phase===r.phase));
    if(idx<0)return false; pool.splice(idx,1);
  }
  return pool.length===0;
}
function sameFormulas(query:ReactantQuery[], refs:ReactionSpeciesRef[]):boolean{
  return [...query.map(formula)].sort().join('|')===[...refs.map(r=>r.formula)].sort().join('|');
}
function conditionMatch(q:ReactionConditions|undefined,r:ReactionConditions):boolean{
  if(!q)return true;
  if(q.tags && !q.tags.every(t=>(r.tags||[]).includes(t))) return false;
  if(q.medium && q.medium!==r.medium)return false;
  if(q.solvent && q.solvent!==r.solvent)return false;
  if(q.electricalCurrent!==undefined && q.electricalCurrent!==r.electricalCurrent)return false;
  if(q.lightRequired!==undefined && q.lightRequired!==r.lightRequired)return false;
  return true;
}
export class ReactionMatcher{
  #records:ReactionRecord[];
  private constructor(records:ReactionRecord[]){this.#records=records.map(r=>Object.freeze({...r}))}
  static from(records:ReactionRecord[]){
    const ids=new Set<string>();
    for(const r of records){if(ids.has(r.id))throw new Error('REACTION_DUPLICATE_ID');ids.add(r.id);if(!r.reactants?.length||!r.products?.length||!r.sourceRefs?.length)throw new Error('REACTION_INVALID')}
    return new ReactionMatcher(records);
  }
  match(query:{reactants:ReactantQuery[];conditions?:ReactionConditions}):ReactionMatchResult{
    let candidates=this.#records.filter(r=>sameFormulas(query.reactants,r.reactants)&&phasesCompatible(query.reactants,r.reactants));
    if(query.conditions)candidates=candidates.filter(r=>conditionMatch(query.conditions,r.conditions));
    if(!candidates.length)return {modeled:false,code:'REACTION_NOT_MODELED'};
    if(candidates.length>1)return {modeled:false,code:'REACTION_CONDITION_REQUIRED'};
    return {modeled:true,reaction:candidates[0]};
  }
}
