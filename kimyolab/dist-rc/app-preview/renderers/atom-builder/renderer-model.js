// AtomRendererModel (P1.4 §9) and its ONE canonical converter. Input: the engine result of the atom-builder
// adapter (finalState and goal are AtomState values derived by src/domain/chemistry/atom.ts; evidence is the
// engine's verdict). The converter formats those values for display — it never derives chemistry: no Z, A,
// charge, element or isotope is computed here (architecture guard CHEMISTRY_COMPUTED_IN_RENDERER).
//
// Element identity comes from the domain (symbol); its learner-facing NAME comes from localization content
// through the mapper the host passes in (P1.4 closeout) — the domain state carries no names.
                                                              

export const ATOM_RENDERER_MODEL_SCHEMA='kimyolab.renderer.atom-state.v1';

                                    
                                           
                 
                  
                   
                      
                    
                
                                                                                          
                                         
                                                                    
                     
                                                                                       
                          
                                                                           
                           
                                                                                                            
                     
                                                                    
                         
                                            
                                                                                                
                      
                                                                                                                          
                           
 

                                                      
const bySymbol                  =(symbol)=>symbol;
const displayName=(s          ,name                  )=>s.construction==='element'&&s.element?name(s.element):null;
const label=(s          ,name                  )=>{const n=displayName(s,name);return n&&s.isotope?`${n}-${s.massNumber}`:null;};
function chargeText(charge       ){
  if(charge===0) return {text:'neytral atom',icon:'○'         };
  return charge>0?{text:`musbat ion (+${charge})`,icon:'⊕'         }:{text:`manfiy ion (−${Math.abs(charge)})`,icon:'⊖'         };
}
const cap=(t       )=>t.charAt(0).toUpperCase()+t.slice(1);
/** Copy for the 'noElementYet' construction state: a step of building, not an "unknown element". */
export const NO_ELEMENT_YET_TEXT='Element hali tanlanmagan: yadroga proton qo‘shing.';
function summary(s          ,name                  ){
  const counts=`${s.protons} proton. ${s.neutrons} neytron. ${s.electrons} elektron.`;
  if(s.construction==='noElementYet') return `${NO_ELEMENT_YET_TEXT} ${counts}`;
  return `${label(s,name)}. ${cap(chargeText(s.charge).text)}. ${counts}`;
}

function isAtomState(x    )               {
  return x&&['protons','neutrons','electrons','atomicNumber','massNumber','charge'].every(k=>Number.isInteger(x[k]))&&'element' in x&&'isotope' in x
    &&(x.construction==='noElementYet'||x.construction==='element');
}

/**
 * The canonical converter: engine result → AtomRendererModel. Throws on a result that is not an atom result.
 * `elementName` is the localized presentation mapper (symbol → name); without it the symbol is shown.
 */
export function toAtomRendererModel(result        ,elementName                  =bySymbol)                  {
  const r=result                                                           ;
  if(!isAtomState(r?.finalState)||!isAtomState(r?.goal)) throw new Error('ATOM_RENDERER_MODEL_INPUT_INVALID');
  const s=r.finalState, g=r.goal;
  const chargeCue=chargeText(s.charge);
  const goalReached=(Array.isArray(r.evidence)?r.evidence:[]).some((e    )=>e?.type==='construction'&&e.achieved===true&&e.targetId===g.isotope);
  return {
    schema:ATOM_RENDERER_MODEL_SCHEMA,
    protons:s.protons,neutrons:s.neutrons,electrons:s.electrons,
    atomicNumber:s.atomicNumber,massNumber:s.massNumber,charge:s.charge,
    construction:s.construction,symbol:s.element,elementName:displayName(s,elementName),isotopeLabel:label(s,elementName),
    chargeLabel:chargeCue.text,chargeIcon:chargeCue.icon,
    goal:{isotopeLabel:label(g,elementName)??String(g.isotope),summary:summary(g,elementName)},
    goalReached,
    accessibleSummary:`${summary(s,elementName)}${goalReached?' Maqsadga yetildi.':''}`,
  };
}
