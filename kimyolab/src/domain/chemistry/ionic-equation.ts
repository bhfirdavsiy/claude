// Net ionic equation comparison (P1.6). The EXPECTED equation always comes from IonicEngine.netIonicEquation
// (reaction KB + dissociation rules); this module only parses the learner's plain-text answer and compares the
// two as chemistry, not as strings:
//
//   - term order does not matter (Ag+ + Cl- → AgCl  ≡  Cl- + Ag+ → AgCl), sides do;
//   - coefficients must match exactly (lowest whole numbers; "2Ag+ + 2Cl- → 2AgCl" is not the net equation);
//   - a phase mark is optional; if written it must agree with the expected one (ions: aq);
//   - species are compared by the domain formula parser (formula + charge).
//
// Accepted plain-text syntax (documented for learners in the renderer):
//   arrow: ->  →  =>  =        terms separated by " + " (spaces around the plus)
//   charges: Ag+  Cl-  NO3-  Ba2+  Ba^2+  SO4^2-  (a polyatomic charge MAGNITUDE needs the caret: SO4^2-,
//            because "SO42-" is ambiguous); superscripts (Ag⁺, SO₄²⁻) and ↓/↑ marks are accepted.
//   Unicode sub/superscripts (SO₄²⁻) and the minus sign (−) are normalized first.
// Anything else is a syntax error (EQUATION_SYNTAX:<reason>) — a typing problem, never a chemistry verdict.
import {parseFormula} from './formula-parser.ts';

export type Phase='aq'|'s'|'l'|'g';
export interface EquationTerm { coefficient:number; formula:string; charge:number; phase:Phase|null }
export type ParsedEquation={ok:true;left:EquationTerm[];right:EquationTerm[]}|{ok:false;code:'EQUATION_SYNTAX';reason:'empty'|'arrow'|'term'|'formula'};

const SUPER:Record<string,string>={'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁺':'+','⁻':'-'};
function normalize(text:string){
  return text
    // superscript charges keep their meaning explicitly: SO₄²⁻ → SO₄^2-, Ag⁺ → Ag^+
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])/g,(_m,d:string,sign:string)=>`^${[...d].map(c=>SUPER[c]).join('')}${SUPER[sign]}`)
    .normalize('NFKC')                          // subscripts ₂ → 2
    .replace(/[−–—]/g,'-')
    .replace(/[↓↑]/g,'')                        // precipitate / gas marks are notation, not species
    .replace(/\s+/g,' ').trim();
}
/** "NO3-" / "NH4+" (single charge on a polyatomic ion) → "NO3^-"; "SO42-" stays ambiguous and is rejected */
function withCaret(f:string){ return /^[A-Z][A-Za-z0-9()]*[A-Za-z)]\d[+-]$/.test(f)?`${f.slice(0,-1)}^${f.slice(-1)}`:f; }

function parseSide(side:string):EquationTerm[]|'term'|'formula'{
  const terms:EquationTerm[]=[];
  for(const raw of side.split(/ \+ /)){
    const m=/^(\d+)?\s*(.+?)(?:\((aq|s|l|g)\))?$/.exec(raw.trim());
    if(!m||!m[2]) return 'term';
    const coefficient=m[1]?Number(m[1]):1;
    if(!Number.isInteger(coefficient)||coefficient<1) return 'term';
    let parsed;
    const f=m[2].trim();
    try{ parsed=parseFormula(f); }catch{ try{ parsed=parseFormula(withCaret(f)); }catch{ return 'formula'; } }
    const existing=terms.find(t=>t.formula===parsed.normalized&&t.charge===parsed.charge);
    const phase=(m[3]??null) as Phase|null;
    if(existing) existing.coefficient+=coefficient;
    else terms.push({coefficient,formula:parsed.normalized,charge:parsed.charge,phase});
  }
  return terms;
}

export function parseIonicEquation(text:string):ParsedEquation{
  const t=normalize(String(text??''));
  if(!t) return {ok:false,code:'EQUATION_SYNTAX',reason:'empty'};
  const sides=t.split(/\s*(?:->|→|=>|⟶|=)\s*/);
  if(sides.length!==2||!sides[0]||!sides[1]) return {ok:false,code:'EQUATION_SYNTAX',reason:'arrow'};
  const left=parseSide(sides[0]), right=parseSide(sides[1]);
  if(typeof left==='string') return {ok:false,code:'EQUATION_SYNTAX',reason:left};
  if(typeof right==='string') return {ok:false,code:'EQUATION_SYNTAX',reason:right};
  return {ok:true,left,right};
}

function sameSide(learner:EquationTerm[],expected:EquationTerm[]):boolean{
  if(learner.length!==expected.length) return false;
  return expected.every(e=>{
    const l=learner.find(x=>x.formula===e.formula&&x.charge===e.charge);
    if(!l||l.coefficient!==e.coefficient) return false;
    const expectedPhase=e.phase??(e.charge!==0?'aq':null);
    return l.phase===null||expectedPhase===null||l.phase===expectedPhase;
  });
}

/**
 * Compares a learner's net ionic equation with the expected one (from IonicEngine).
 * Returns a syntax error for unreadable input, otherwise the chemistry verdict.
 */
export function compareNetIonic(learner:string,expected:string):{syntax:'ok';correct:boolean}|{syntax:'error';reason:string}{
  const e=parseIonicEquation(expected);
  if(!e.ok) throw new Error('IONIC_EXPECTED_EQUATION_INVALID');
  const l=parseIonicEquation(learner);
  if(!l.ok) return {syntax:'error',reason:l.reason};
  return {syntax:'ok',correct:sameSide(l.left,e.left)&&sameSide(l.right,e.right)};
}
