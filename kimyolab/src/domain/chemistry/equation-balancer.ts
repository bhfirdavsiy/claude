import { parseFormula } from './formula-parser.ts';
import { Rational, gcdBig, lcmBig } from './rational.ts';

export interface BalancedEquation {
  reactants:string[];
  products:string[];
  reactantCoefficients:number[];
  productCoefficients:number[];
  coefficients:number[];
  equation:string;
}

function splitEquation(input:string):{reactants:string[];products:string[]} {
  const parts=input.split(/\s*(?:->|→|=)\s*/);
  if(parts.length!==2) throw new Error('EQUATION_INVALID');
  const side=(s:string)=>s.split(/\s+\+\s+/).map(x=>x.trim()).filter(Boolean);
  const reactants=side(parts[0]), products=side(parts[1]);
  if(!reactants.length||!products.length) throw new Error('EQUATION_INVALID');
  return {reactants,products};
}

function rref(matrix:Rational[][]):{matrix:Rational[][];pivots:number[]} {
  const a=matrix.map(row=>row.map(x=>new Rational(x.n,x.d)));
  const rows=a.length, cols=a[0]?.length||0; const pivots:number[]=[];
  let r=0;
  for(let c=0;c<cols&&r<rows;c++){
    let pivot=r; while(pivot<rows&&a[pivot][c].isZero()) pivot++;
    if(pivot===rows) continue;
    [a[r],a[pivot]]=[a[pivot],a[r]];
    const p=a[r][c]; a[r]=a[r].map(x=>x.div(p));
    for(let rr=0;rr<rows;rr++) if(rr!==r&&!a[rr][c].isZero()){
      const f=a[rr][c]; a[rr]=a[rr].map((x,j)=>x.sub(f.mul(a[r][j])));
    }
    pivots.push(c); r++;
  }
  return {matrix:a,pivots};
}

function nullVector(matrix:Rational[][]):Rational[] {
  const {matrix:a,pivots}=rref(matrix); const cols=matrix[0].length;
  const pivotSet=new Set(pivots); const free=[] as number[];
  for(let c=0;c<cols;c++) if(!pivotSet.has(c)) free.push(c);
  if(free.length!==1) throw new Error(free.length===0?'EQUATION_NO_POSITIVE_SOLUTION':'EQUATION_UNDERDETERMINED');
  const f=free[0]; const x=Array.from({length:cols},()=>new Rational(0)); x[f]=new Rational(1);
  for(let ri=pivots.length-1;ri>=0;ri--){
    const pc=pivots[ri]; let sum=new Rational(0);
    for(let c=pc+1;c<cols;c++) sum=sum.add(a[ri][c].mul(x[c]));
    x[pc]=sum.neg();
  }
  return x;
}

function integers(vec:Rational[]):number[] {
  let lcm=1n; for(const v of vec) lcm=lcmBig(lcm,v.d);
  let ints=vec.map(v=>v.n*(lcm/v.d));
  const nonzero=ints.filter(x=>x!==0n);
  if(!nonzero.length) throw new Error('EQUATION_NO_POSITIVE_SOLUTION');
  if(nonzero.every(x=>x<0n)) ints=ints.map(x=>-x);
  if(!ints.every(x=>x>0n)) throw new Error('EQUATION_NO_POSITIVE_SOLUTION');
  let g=ints[0]; for(const x of ints.slice(1)) g=gcdBig(g,x); ints=ints.map(x=>x/g);
  return ints.map(x=>Number(x));
}


export function solveIntegerNullVector(matrix:number[][]):number[] {
  if(!matrix.length || !matrix[0]?.length) throw new Error('EQUATION_INVALID');
  return integers(nullVector(matrix.map(row=>row.map(v=>new Rational(v)))));
}

function fmt(coeff:number, formula:string){return `${coeff===1?'':coeff}${formula}`}

export function balanceSpecies(reactants:string[],products:string[]):BalancedEquation {
  const parsed=[...reactants,...products].map(parseFormula);
  const elements=[...new Set(parsed.flatMap(p=>Object.keys(p.atoms)))].sort();
  const matrix=elements.map(el=>parsed.map((p,i)=>new Rational((p.atoms[el]||0)*(i<reactants.length?1:-1))));
  const coeff=solveIntegerNullVector(matrix.map(row=>row.map(v=>Number(v.n))));
  const rc=coeff.slice(0,reactants.length), pc=coeff.slice(reactants.length);
  return {reactants,products,reactantCoefficients:rc,productCoefficients:pc,coefficients:coeff,
    equation:`${reactants.map((f,i)=>fmt(rc[i],f)).join(' + ')} → ${products.map((f,i)=>fmt(pc[i],f)).join(' + ')}`};
}

export function balanceEquation(input:string):BalancedEquation { const {reactants,products}=splitEquation(input); return balanceSpecies(reactants,products); }
