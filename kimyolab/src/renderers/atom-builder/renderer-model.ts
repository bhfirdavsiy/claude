// AtomRendererModel (P1.4 §9) and its ONE canonical converter. Input: the engine result of the atom-builder
// adapter (finalState and goal are AtomState values derived by src/domain/chemistry/atom.ts; evidence is the
// engine's verdict). The converter formats those values for display — it never derives chemistry: no Z, A,
// charge, element or isotope is computed here (architecture guard CHEMISTRY_COMPUTED_IN_RENDERER).
//
// Element identity comes from the domain (symbol); its learner-facing NAME comes from localization content
// through the mapper the host passes in (P1.4 closeout) — the domain state carries no names.
import type {AtomState} from '../../domain/chemistry/atom.ts';

export const ATOM_RENDERER_MODEL_SCHEMA='kimyolab.renderer.atom-state.v1';

export interface AtomRendererModel {
  schema:typeof ATOM_RENDERER_MODEL_SCHEMA;
  protons:number;
  neutrons:number;
  electrons:number;
  atomicNumber:number;
  massNumber:number;
  charge:number;
  /** domain construction state: 'noElementYet' while no proton has been placed (Z = 0) */
  construction:AtomState['construction'];
  /** element symbol (domain identity), or null in 'noElementYet' */
  symbol:string|null;
  /** localized display name of the symbol (presentation), or null in 'noElementYet' */
  elementName:string|null;
  /** learner-facing, e.g. "Uglerod-14"; null while there are no protons */
  isotopeLabel:string|null;
  /** text form of the charge — never colour only: "neytral atom" / "musbat ion (+1)" / "manfiy ion (−2)" */
  chargeLabel:string;
  /** shape cue for the charge: ○ neutral, ⊕ positive, ⊖ negative */
  chargeIcon:'○'|'⊕'|'⊖';
  goal:{isotopeLabel:string;summary:string};
  /** from the engine's evidence (construction achieved), not from comparing counts in the UI */
  goalReached:boolean;
  /** plain-language live summary for screen readers, e.g. "Uglerod-14. Neytral atom. 6 proton. 8 neytron. 6 elektron." */
  accessibleSummary:string;
}

export type ElementNameLookup=(symbol:string)=>string;
const bySymbol:ElementNameLookup=(symbol)=>symbol;
const displayName=(s:AtomState,name:ElementNameLookup)=>s.construction==='element'&&s.element?name(s.element):null;
const label=(s:AtomState,name:ElementNameLookup)=>{const n=displayName(s,name);return n&&s.isotope?`${n}-${s.massNumber}`:null;};
function chargeText(charge:number){
  if(charge===0) return {text:'neytral atom',icon:'○' as const};
  return charge>0?{text:`musbat ion (+${charge})`,icon:'⊕' as const}:{text:`manfiy ion (−${Math.abs(charge)})`,icon:'⊖' as const};
}
const cap=(t:string)=>t.charAt(0).toUpperCase()+t.slice(1);
/** Copy for the 'noElementYet' construction state: a step of building, not an "unknown element". */
export const NO_ELEMENT_YET_TEXT='Element hali tanlanmagan: yadroga proton qo‘shing.';
function summary(s:AtomState,name:ElementNameLookup){
  const counts=`${s.protons} proton. ${s.neutrons} neytron. ${s.electrons} elektron.`;
  if(s.construction==='noElementYet') return `${NO_ELEMENT_YET_TEXT} ${counts}`;
  return `${label(s,name)}. ${cap(chargeText(s.charge).text)}. ${counts}`;
}

function isAtomState(x:any):x is AtomState{
  return x&&['protons','neutrons','electrons','atomicNumber','massNumber','charge'].every(k=>Number.isInteger(x[k]))&&'element' in x&&'isotope' in x
    &&(x.construction==='noElementYet'||x.construction==='element');
}

/**
 * The canonical converter: engine result → AtomRendererModel. Throws on a result that is not an atom result.
 * `elementName` is the localized presentation mapper (symbol → name); without it the symbol is shown.
 */
export function toAtomRendererModel(result:unknown,elementName:ElementNameLookup=bySymbol):AtomRendererModel{
  const r=result as {finalState?:unknown;goal?:unknown;evidence?:unknown[]};
  if(!isAtomState(r?.finalState)||!isAtomState(r?.goal)) throw new Error('ATOM_RENDERER_MODEL_INPUT_INVALID');
  const s=r.finalState, g=r.goal;
  const chargeCue=chargeText(s.charge);
  const goalReached=(Array.isArray(r.evidence)?r.evidence:[]).some((e:any)=>e?.type==='construction'&&e.achieved===true&&e.targetId===g.isotope);
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
