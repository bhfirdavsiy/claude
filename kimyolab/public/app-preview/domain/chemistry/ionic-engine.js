import { balanceSpecies } from './equation-balancer.js';
import { parseFormula } from './formula-parser.js';
                                                 
                                                                                  
                                                                                  
                                                                              
function fmt(n       ,f       ){return `${n===1?'':n}${f}`}
/**
 * How a species is written in a net ionic equation is decided ONLY from reaction-level data (P1.7 — no guessing):
 *   dissociation rule → ions (aq) · explicit phase on the reaction record · insoluble list → (s) · H2O → (l).
 * A species with none of these is NOT treated as molecular by default: netIonicEquation throws
 * NET_IONIC_UNSUPPORTED. (The species registry's phase is the standard state of the pure substance — e.g. NaBr(s) —
 * not its state in a reaction, so it is deliberately NOT used.)
 */
export class IonicEngine{
  #reactions                           ;#rules                    ;#insoluble            ;
          constructor(input                                                 ){
    this.#reactions=new Map(input.reactions.map(r=>[r.id,r]));
    this.#rules=new Map(input.rules.dissociation.map(r=>[r.formula,r]));
    this.#insoluble=new Set(input.rules.insoluble||[]);
  }
  static from(input                                                 ){return new IonicEngine(input)}
  /** Can the net ionic equation of this reaction be derived from data alone? Lists what is missing if not. */
  support(reactionId       )                                                        {
    const r=this.#reactions.get(reactionId);if(!r)return {supported:false,unsupported:[`reaction:${reactionId}`]};
    const unsupported=[...r.reactants,...r.products].filter(x=>!this.#determined(x.formula,x.phase)).map(x=>x.formula);
    return unsupported.length?{supported:false,unsupported:[...new Set(unsupported)]}:{supported:true};
  }
  #determined(formula       ,phase        ){
    return this.#rules.has(formula)||Boolean(phase)||this.#insoluble.has(formula)||formula==='H2O';
  }
  dissociate(formula       ){const r=this.#rules.get(formula);return r?{modeled:true,ions:r.ions.map(x=>({...x}))}:{modeled:false,code:'DISSOCIATION_NOT_MODELED'         }}
  #expand(formulas         ,coeffs         ,refs                                      )           {
    const out           =[];
    formulas.forEach((formula,i)=>{
      const base=coeffs[i], rule=this.#rules.get(formula);
      if(rule){for(const ion of rule.ions)out.push({formula:ion.formula,coefficient:base*ion.coefficient,ionic:true,phase:'aq'});return}
      let phase=refs.find(r=>r.formula===formula)?.phase;
      if(!phase&&this.#insoluble.has(formula))phase='s';
      if(!phase&&formula==='H2O')phase='l';
      if(!phase)throw new Error(`NET_IONIC_UNSUPPORTED:${formula}`);
      out.push({formula,coefficient:base,ionic:false,phase});
    });
    return out;
  }
  netIonicEquation(reactionId       ){
    const r=this.#reactions.get(reactionId);if(!r)throw new Error('REACTION_NOT_MODELED');
    const rf=r.reactants.map(x=>x.formula),pf=r.products.map(x=>x.formula);
    const bal=balanceSpecies(rf,pf);
    const left=this.#expand(rf,bal.reactantCoefficients,r.reactants),right=this.#expand(pf,bal.productCoefficients,r.products);
    for(const l of left.filter(x=>x.ionic)){
      const rr=right.find(x=>x.ionic&&x.formula===l.formula&&x.coefficient>0);
      if(!rr)continue;const n=Math.min(l.coefficient,rr.coefficient);l.coefficient-=n;rr.coefficient-=n;
    }
    const render=(xs           )=>xs.filter(x=>x.coefficient>0).sort((a,b)=>{const ca=a.ionic?parseFormula(a.formula).charge:0,cb=b.ionic?parseFormula(b.formula).charge:0;const rank=(x         ,c       )=>x.ionic?(c>0?0:1):2;return rank(a,ca)-rank(b,cb)||a.formula.localeCompare(b.formula)}).map(x=>fmt(x.coefficient,`${x.formula}${x.ionic?'':x.phase?`(${x.phase})`:''}`)).join(' + ');
    return {reactionId,equation:`${render(left)} → ${render(right)}`,left,right};
  }
}
