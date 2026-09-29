import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, FormulaError } from '../src/domain/chemistry/formula-parser.ts';

function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}

test('parser handles deterministic bounded generated valid formulas',()=>{
  const rand=mulberry32(20260915);
  const elements=['H','C','N','O','Na','Mg','Al','Si','P','S','Cl','K','Ca','Fe','Cu','Zn'];
  for(let i=0;i<250;i++){
    const a=elements[Math.floor(rand()*elements.length)],b=elements[Math.floor(rand()*elements.length)];
    const na=1+Math.floor(rand()*5),nb=1+Math.floor(rand()*6);
    const formula=`${a}${na===1?'':na}${b}${nb===1?'':nb}`;
    const p=parseFormula(formula);
    assert.equal(p.atoms[a]>=na,true,formula);
    assert.equal(Object.values(p.atoms).every(n=>Number.isInteger(n)&&n>0),true,formula);
  }
});

test('parser rejects deterministic malformed token corpus without crashing',()=>{
  const bad=['(',')','Ca(OH','Na..Cl','2H2O','H0','Fe^^2+','C{OH]2','@@',''];
  for(const f of bad) assert.throws(()=>parseFormula(f),err=>err instanceof FormulaError,f);
});
