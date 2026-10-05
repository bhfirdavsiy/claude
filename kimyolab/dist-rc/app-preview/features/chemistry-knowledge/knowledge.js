// P2.14 — the Substance / Reaction knowledge index contract (kimyolab.chemistry-knowledge.v1, ADR-P2-015). Built at
// content-pack time by scripts/lib/chemistry-knowledge.ts from the ONE canonical chemistry graph (the same graph as
// the Element Hub). It carries only DERIVED facts and their provenance — identity (formula, phase, charge, name key)
// stays in chemistry/species.json and the reaction records stay in chemistry/reactions.json, so nothing is
// duplicated. Every field says how it is known; a field nobody can vouch for is an explicit gap, never a guess.

/** a registered source, title as the canonical source registry states it */
                                                      

export const CHEMISTRY_KNOWLEDGE_SCHEMA='kimyolab.chemistry-knowledge.v1';
export const CHEMISTRY_KNOWLEDGE_PACK_PATH='knowledge/chemistry-knowledge.json';
/** the route key of a substance: its canonical species id without the `species.` namespace (a bijection — the build
 *  refuses an id that does not have the namespace or whose key is not unique). A formula is never a route key. */
export const SPECIES_ID_PREFIX='species.';
export const substanceKey=(speciesId       )=>speciesId.startsWith(SPECIES_ID_PREFIX)?speciesId.slice(SPECIES_ID_PREFIX.length):speciesId;
export const SUBSTANCE_KEY=/^[a-z0-9][a-z0-9_-]*$/;

                         
                                                                                                                         
                                                                                                                 
                                                                                    
                                                        
                                                                                                           
                                                                                                             
                                                                                                       
                         
                                 // IonicEngine.support() is not supported:true for this reaction

/** How a learner may see a field. Governance codes stay in the reports; the learner sees a natural sentence. */
                              
                                             
                                                          
                                                                                           
                                                                                     
                                                                                                       
                                                         
                                                                                     
                                                   
                                       

/** A relation and the evidence chain it rests on (`via`: the lab / reaction / shelf that proves it). Every relation
 *  is a participation; PRIMARY does not exist in this index (it needs an explicit, reviewed authored relation). */
                                                              
/** the provenance of each relation list (one per list, so the pack file does not repeat it per item) */
export const RELATION_PROVENANCE={
  substance:{elements:'DERIVED_FROM_FORMULA',reactions:'REACTION_PARTICIPANT',labs:'EXPLICIT_MAPPING',topics:'EXPLICIT_MAPPING'},
  reaction:{elements:'DERIVED_FROM_FORMULA',labs:'EXPLICIT_MAPPING',topics:'EXPLICIT_MAPPING'},
}         ;

                                     
                        
                                                    
                                   
                                                                          
                                   
                                                                  
                                                                                                                  
                                                                                                       
 
                                    
            
                                                                                                            
                                                                          
                                                                                                                
                                     
                                         
                                       
                                                                                                                  
                                   
                                                                                    
 
                                 
                                           
                                  
                                
                                                                                                               
                                                       
                                       
                                                      
 

/** Fail-closed shape check on the pack file. */
export function assertKnowledgeIndex(raw    )               {
  if(!raw||raw.schema!==CHEMISTRY_KNOWLEDGE_SCHEMA) throw new Error('CHEMISTRY_KNOWLEDGE_INVALID:schema');
  for(const k of ['substances','reactions','conditions','labs','topics']) if(!Array.isArray(raw[k])) throw new Error(`CHEMISTRY_KNOWLEDGE_INVALID:${k}`);
  const keys=new Set        ();
  for(const s of raw.substances){
    if(typeof s?.id!=='string'||!SUBSTANCE_KEY.test(String(s?.key))||substanceKey(s.id)!==s.key||keys.has(s.key)) throw new Error(`CHEMISTRY_KNOWLEDGE_INVALID:substance:${s?.id}`);
    keys.add(s.key);
  }
  return raw                  ;
}
