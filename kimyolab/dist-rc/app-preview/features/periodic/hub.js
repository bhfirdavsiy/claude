// P2.13 — the Element Hub contract (kimyolab.element-hub.v1, ADR-P2-014). Built at content-pack time by
// scripts/lib/element-hub.ts from the canonical sources; the learner page only reads it (no chemistry is computed in
// the browser). Identity (Z, symbol) comes from src/domain/chemistry/periodic-table.ts; every other field says where
// it comes from, and a field without a source is an explicit gap — never a guess.
import {ELEMENT_SYMBOLS} from '../../domain/chemistry/periodic-table.js';

export const ELEMENT_HUB_SCHEMA='kimyolab.element-hub.v1';
export const ELEMENT_METADATA_SCHEMA='kimyolab.element-metadata.v1';
export const ELEMENT_HUB_PACK_PATH='periodic/element-hub.json';

                                                                                                             
                                                      
                        
                                                                                                 
                                                                                 
                                                                                                                
                                                                                                  
                                    

                                                                                             
                                                                                                                                

                             
                          
                                     
                                                  
                                                                 
                                                                                                                   
                                                                                                                              
 
                                                                           
                                                           
                                                   
                                                                   
                             
                                                                                  
                                                                                                              
 

/** Fail-closed shape check on the pack file: exactly the canonical 118 identities, in order, nothing else. */
export function assertElementHub(raw    )           {
  if(!raw||raw.schema!==ELEMENT_HUB_SCHEMA||raw.metadataSchema!==ELEMENT_METADATA_SCHEMA) throw new Error('ELEMENT_HUB_INVALID:schema');
  const els=raw.elements;
  if(!Array.isArray(els)||els.length!==ELEMENT_SYMBOLS.length) throw new Error('ELEMENT_HUB_INVALID:count');
  els.forEach((e    ,i       )=>{ if(e?.z!==i+1||e?.symbol!==ELEMENT_SYMBOLS[i]) throw new Error(`ELEMENT_HUB_INVALID:identity:${i+1}`); });
  for(const k of ['substances','reactions','labs','topics']) if(!Array.isArray(raw[k])) throw new Error(`ELEMENT_HUB_INVALID:${k}`);
  return raw              ;
}
