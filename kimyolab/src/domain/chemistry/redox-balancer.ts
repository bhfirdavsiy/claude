import { parseFormula } from './formula-parser.ts';
import { solveIntegerNullVector } from './equation-balancer.ts';

export type RedoxMedium='acidic'|'basic'|'neutral';
export interface RedoxRequest { reactants:string[]; products:string[]; medium:RedoxMedium }
export interface RedoxResult { reactants:string[]; products:string[]; coefficients:number[]; equation:string }

type Placement=-1|0|1; // -1 left, 0 absent, 1 right
function positions(items:string[]):Array<Record<string,Placement>>{
  const out:Array<Record<string,Placement>>=[];
  function walk(i:number,cur:Record<string,Placement>){
    if(i===items.length){out.push({...cur});return;}
    for(const p of [-1,0,1] as Placement[]){cur[items[i]]=p;walk(i+1,cur);}
  }
  walk(0,{}); return out;
}
function label(c:number,f:string){return `${c===1?'':c}${f}`}

function tryCandidate(req:RedoxRequest, placement:Record<string,Placement>):RedoxResult|null {
  const aux=Object.keys(placement);
  const left=[...req.reactants,...aux.filter(a=>placement[a]===-1)];
  const right=[...req.products,...aux.filter(a=>placement[a]===1)];
  const all=[...left,...right];
  let parsed;
  try{parsed=all.map(parseFormula)}catch{return null}
  const elements=[...new Set(parsed.flatMap(p=>Object.keys(p.atoms)))].sort();
  const matrix:number[][]=elements.map(el=>parsed.map((p,i)=>(p.atoms[el]||0)*(i<left.length?1:-1)));
  matrix.push(parsed.map((p,i)=>p.charge*(i<left.length?1:-1)));
  let coeff:number[];
  try{coeff=solveIntegerNullVector(matrix)}catch{return null}
  const eq=`${left.map((f,i)=>label(coeff[i],f)).join(' + ')} → ${right.map((f,i)=>label(coeff[left.length+i],f)).join(' + ')}`;
  return {reactants:left,products:right,coefficients:coeff,equation:eq};
}

export function balanceRedox(req:RedoxRequest):RedoxResult {
  if(!req.reactants.length||!req.products.length) throw new Error('REDOX_INVALID');
  const auxiliaries=req.medium==='acidic'?['H2O','H+']:req.medium==='basic'?['H2O','OH-']:['H2O'];
  const candidates=positions(auxiliaries)
    .map(p=>tryCandidate(req,p)).filter((x):x is RedoxResult=>!!x)
    .filter(x=>req.reactants.every(r=>x.reactants.includes(r))&&req.products.every(p=>x.products.includes(p)));
  if(!candidates.length) throw new Error('REDOX_NOT_BALANCED');
  candidates.sort((a,b)=>{
    const auxA=a.reactants.length+a.products.length-req.reactants.length-req.products.length;
    const auxB=b.reactants.length+b.products.length-req.reactants.length-req.products.length;
    if(auxA!==auxB) return auxA-auxB;
    const sum=(x:RedoxResult)=>x.coefficients.reduce((s,n)=>s+n,0);
    return sum(a)-sum(b);
  });
  const best=candidates[0];
  const same=candidates.filter(x=>x.coefficients.reduce((s,n)=>s+n,0)===best.coefficients.reduce((s,n)=>s+n,0) && x.equation!==best.equation);
  if(same.length) throw new Error('REDOX_AMBIGUOUS');
  return best;
}
