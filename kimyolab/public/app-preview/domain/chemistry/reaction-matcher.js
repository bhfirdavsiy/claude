                                                                                                
import {dimensionsOf,                        } from './condition-vocabulary.js';
                                                               
                                                                                                                                                                               

function formula(x              ){return typeof x==='string'?x:x.formula}
function phasesCompatible(query                , refs                     )        {
  const pool=[...refs];
  for(const q of query){
    const idx=pool.findIndex(r=>r.formula===formula(q) && (typeof q==='string'||!q.phase||!r.phase||q.phase===r.phase));
    if(idx<0)return false; pool.splice(idx,1);
  }
  return pool.length===0;
}
function sameFormulas(query                , refs                     )        {
  return [...query.map(formula)].sort().join('|')===[...refs.map(r=>r.formula)].sort().join('|');
}
function conditionMatch(q                             ,r                   )        {
  if(!q)return true;
  if(q.tags && !q.tags.every(t=>(r.tags||[]).includes(t))) return false;
  if(q.medium && q.medium!==r.medium)return false;
  if(q.solvent && q.solvent!==r.solvent)return false;
  if(q.electricalCurrent!==undefined && q.electricalCurrent!==r.electricalCurrent)return false;
  if(q.lightRequired!==undefined && q.lightRequired!==r.lightRequired)return false;
  return true;
}
/** reactionType of an explicit modeled "no reaction" record (P1.6). */
export const NO_REACTION_TYPE='no-reaction';
export const isNoReaction=(r               )=>r.reactionType===NO_REACTION_TYPE;

/**
 * Does a record's condition requirement hold in the ACTUAL conditions? (policy 'require-record-conditions')
 *
 *   record field unspecified                → no requirement (always met)
 *   record field specified, actual missing  → NOT met (unknown is never assumed to be satisfied)
 *   record field specified, actual differs  → NOT met (conflicting)
 *
 * Fields: tags (each required tag present), lightRequired / electricalCurrent (booleans must agree), medium,
 * solvent (equal), catalystIds (each present), temperatureRange / pressureRange / concentrationRules (the actual
 * conditions must state the same value — no range arithmetic is guessed).
 */
export function requirementsMet(r                             ,actual                             ,vocabulary                     )        {
  const a=actual??{};
  if(vocabulary){
    // P1.7: tags are compared by MEANING (dimension = value) through the reviewed condition vocabulary. An unknown
    // or self-conflicting record tag is never guessed: the requirement is not met (and the chemistry gate FAILs).
    const req=dimensionsOf(r?.tags??[],vocabulary);
    if(req.unknown.length||req.conflicts.length)return false;
    const have={...(a.dimensions??{}),...dimensionsOf(a.tags??[],vocabulary).dimensions};
    if(Object.entries(req.dimensions).some(([d,v])=>have[d]!==v))return false;
  }
  else if((r?.tags??[]).some(t=>!(a.tags??[]).includes(t)))return false;
  if(r?.lightRequired!==undefined&&Boolean(a.lightRequired)!==r.lightRequired)return false;
  if(r?.electricalCurrent!==undefined&&Boolean(a.electricalCurrent)!==r.electricalCurrent)return false;
  if(r?.medium!==undefined&&r.medium!==a.medium)return false;
  if(r?.solvent!==undefined&&r.solvent!==a.solvent)return false;
  if((r?.catalystIds??[]).some(c=>!(a.catalystIds??[]).includes(c)))return false;
  for(const k of ['temperatureRange','pressureRange','concentrationRules']         )
    if(r?.[k]!==undefined&&JSON.stringify(r[k])!==JSON.stringify(a[k]))return false;
  return true;
}

/**
 * How a caller's conditions are used — ALWAYS explicit (P1.6 closeout: no implicit default):
 *  - 'filter-by-query'           : legacy/reference behaviour. Query conditions (if any) narrow the candidates;
 *                                  a record's own requirements are NOT enforced; >1 candidate → CONDITION_REQUIRED.
 *  - 'require-record-conditions' : the query states the complete ACTUAL conditions (e.g. two solutions mixed at
 *                                  room temperature = no tags). A record whose requirements are not met does not
 *                                  apply → REACTION_CONDITIONS_NOT_MET.
 */
                                                                          

/** The three modeled/unmodeled classes (P1.6 closeout). NOT_MODELED never means "does not react". */
                                                                              
export function classifyMatch(m                    )           {
  return !m.modeled?'NOT_MODELED':isNoReaction(m.reaction)?'MODELED_NO_REACTION':'MODELED_REACTION';
}

export class ReactionMatcher{
  #records                 ;
  #vocabulary                              ;
          constructor(records                 ,vocabulary                     ){this.#records=records.map(r=>Object.freeze({...r}));this.#vocabulary=vocabulary}
  /** `vocabulary` (P1.7): structured meaning of condition tags for 'require-record-conditions'. */
  static from(records                 ,options                                  ={}){
    const ids=new Set        ();
    for(const r of records){
      if(ids.has(r.id))throw new Error('REACTION_DUPLICATE_ID');ids.add(r.id);
      if(!r.reactants?.length||!r.sourceRefs?.length)throw new Error('REACTION_INVALID');
      // P1.6: an explicit, reviewed "these reactants do not react" record is a MODELED result, distinct from an
      // unknown pair (REACTION_NOT_MODELED). It has no products and only a no-visible-change observation.
      if(isNoReaction(r)){ if(r.products?.length||!(r.observations??[]).every(o=>o.type==='no-visible-change'))throw new Error('REACTION_INVALID'); }
      else if(!r.products?.length)throw new Error('REACTION_INVALID');
    }
    return new ReactionMatcher(records,options.vocabulary);
  }
  /** P2.14: the records written for exactly these reactants (the same formula + phase rule as match()), BEFORE any
   *  condition is applied, so a caller can name which conditions the model requires. It decides nothing: an empty
   *  list means "not modeled", never "does not react". */
  candidates(reactants                )                          {
    return this.#records.filter(r=>sameFormulas(reactants,r.reactants)&&phasesCompatible(reactants,r.reactants));
  }
  match(query                                                                                           )                    {
    if(query?.conditionPolicy!=='filter-by-query'&&query?.conditionPolicy!=='require-record-conditions') throw new Error('REACTION_MATCH_POLICY_REQUIRED');
    let candidates=[...this.candidates(query.reactants)];
    if(query.conditionPolicy==='filter-by-query'){
      if(query.conditions)candidates=candidates.filter(r=>conditionMatch(query.conditions,r.conditions));
    }else{
      const before=candidates.length;
      candidates=candidates.filter(r=>requirementsMet(r.conditions,query.conditions,this.#vocabulary));
      if(before&&!candidates.length)return {modeled:false,code:'REACTION_CONDITIONS_NOT_MET'};
    }
    if(!candidates.length)return {modeled:false,code:'REACTION_NOT_MODELED'};
    if(candidates.length>1)return {modeled:false,code:'REACTION_CONDITION_REQUIRED'};
    return {modeled:true,reaction:candidates[0]};
  }
}
