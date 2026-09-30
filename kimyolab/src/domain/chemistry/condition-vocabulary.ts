// Condition vocabulary (P1.7). reactions.json states conditions as free-text tags ("gentle heating",
// "concentrated acid", …). This module gives each tag a structured meaning — ONE value of ONE condition dimension —
// from reviewed content (content-src/chemistry/condition-vocabulary.json). Nothing is inferred from observation
// text, and an unknown tag is never guessed: it makes the record's requirement unmet (fail closed) and the
// chemistry gate FAILs.
export const CONDITION_VOCABULARY_SCHEMA='kimyolab.chemistry.condition-vocabulary.v1';

export interface ConditionTerm { dimension:string; value:string }
export interface ConditionContext { description:string; dimensions:Readonly<Record<string,string>> }
export interface ConditionVocabulary {
  terms:Readonly<Record<string,ConditionTerm>>;
  contexts:Readonly<Record<string,ConditionContext>>;
  reviewStatus:string;
}

const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;

export function parseConditionVocabulary(raw:unknown):ConditionVocabulary{
  const r=raw as any;
  if(!r||r.schema!==CONDITION_VOCABULARY_SCHEMA) throw new Error('CONDITION_VOCABULARY_INVALID:schema');
  if(!r.terms||typeof r.terms!=='object') throw new Error('CONDITION_VOCABULARY_INVALID:terms');
  const terms:Record<string,ConditionTerm>={};
  for(const [tag,t] of Object.entries(r.terms as Record<string,any>)){
    if(!text(tag)||!t||!text(t.dimension)||!text(t.value)) throw new Error(`CONDITION_VOCABULARY_INVALID:term:${tag}`);
    terms[tag]=Object.freeze({dimension:t.dimension,value:t.value});
  }
  const contexts:Record<string,ConditionContext>={};
  for(const [id,c] of Object.entries((r.contexts??{}) as Record<string,any>)){
    if(!c||!text(c.description)||!c.dimensions||typeof c.dimensions!=='object') throw new Error(`CONDITION_VOCABULARY_INVALID:context:${id}`);
    for(const [d,v] of Object.entries(c.dimensions)) if(!text(d)||!text(v)) throw new Error(`CONDITION_VOCABULARY_INVALID:context:${id}:${d}`);
    contexts[id]=Object.freeze({description:c.description,dimensions:Object.freeze({...c.dimensions})});
  }
  if(!text(r.reviewStatus)) throw new Error('CONDITION_VOCABULARY_INVALID:reviewStatus');
  return Object.freeze({terms:Object.freeze(terms),contexts:Object.freeze(contexts),reviewStatus:r.reviewStatus});
}

/** tags → {dimension: value}; unknown tags and two values for one dimension are reported, never resolved. */
export function dimensionsOf(tags:readonly string[],vocabulary:ConditionVocabulary):{dimensions:Record<string,string>;unknown:string[];conflicts:string[]}{
  const dimensions:Record<string,string>={}, unknown:string[]=[], conflicts:string[]=[];
  for(const tag of tags){
    const t=vocabulary.terms[tag];
    if(!t){ unknown.push(tag); continue; }
    if(dimensions[t.dimension]!==undefined&&dimensions[t.dimension]!==t.value) conflicts.push(t.dimension);
    dimensions[t.dimension]=t.value;
  }
  return {dimensions,unknown,conflicts};
}
