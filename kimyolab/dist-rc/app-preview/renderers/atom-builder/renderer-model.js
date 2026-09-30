// AtomRendererModel (P1.4 §9) and its ONE canonical converter. Input: the engine result of the atom-builder
// adapter (finalState and goal are AtomState values derived by src/domain/chemistry/atom.ts; evidence is the
// engine's verdict). The converter formats those values for display — it never derives chemistry: no Z, A,
// charge, element or isotope is computed here (architecture guard CHEMISTRY_COMPUTED_IN_RENDERER).
                                                              

export const ATOM_RENDERER_MODEL_SCHEMA='kimyolab.renderer.atom-state.v1';

                                    
                                           
                 
                  
                   
                      
                    
                
                                                           
                     
                          
                                                                           
                           
                                                                                                            
                     
                                                                    
                         
                                            
                                                                                                
                      
                                                                                                                          
                           
 

const label=(s          )=>s.elementName&&s.isotope?`${s.elementName}-${s.massNumber}`:null;
function chargeText(charge       ){
  if(charge===0) return {text:'neytral atom',icon:'○'         };
  return charge>0?{text:`musbat ion (+${charge})`,icon:'⊕'         }:{text:`manfiy ion (−${Math.abs(charge)})`,icon:'⊖'         };
}
const cap=(t       )=>t.charAt(0).toUpperCase()+t.slice(1);
function summary(s          ){
  const counts=`${s.protons} proton. ${s.neutrons} neytron. ${s.electrons} elektron.`;
  if(!s.elementName) return `Hali proton yo‘q — element aniqlanmagan. ${counts}`;
  return `${label(s)}. ${cap(chargeText(s.charge).text)}. ${counts}`;
}

function isAtomState(x    )               {
  return x&&['protons','neutrons','electrons','atomicNumber','massNumber','charge'].every(k=>Number.isInteger(x[k]))&&'element' in x&&'isotope' in x;
}

/** The canonical converter: engine result → AtomRendererModel. Throws on a result that is not an atom result. */
export function toAtomRendererModel(result        )                  {
  const r=result                                                           ;
  if(!isAtomState(r?.finalState)||!isAtomState(r?.goal)) throw new Error('ATOM_RENDERER_MODEL_INPUT_INVALID');
  const s=r.finalState, g=r.goal;
  const chargeCue=chargeText(s.charge);
  const goalReached=(Array.isArray(r.evidence)?r.evidence:[]).some((e    )=>e?.type==='construction'&&e.achieved===true&&e.targetId===g.isotope);
  return {
    schema:ATOM_RENDERER_MODEL_SCHEMA,
    protons:s.protons,neutrons:s.neutrons,electrons:s.electrons,
    atomicNumber:s.atomicNumber,massNumber:s.massNumber,charge:s.charge,
    symbol:s.element,elementName:s.elementName,isotopeLabel:label(s),
    chargeLabel:chargeCue.text,chargeIcon:chargeCue.icon,
    goal:{isotopeLabel:label(g)??String(g.isotope),summary:summary(g)},
    goalReached,
    accessibleSummary:`${summary(s)}${goalReached?' Maqsadga yetildi.':''}`,
  };
}
