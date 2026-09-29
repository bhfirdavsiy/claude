export interface Nuclide{A:number;Z:number}
export function validateNuclearEquation(input:{reactants:Nuclide[];products:Nuclide[]}):boolean{
  if(!input.reactants.length||!input.products.length) throw new Error('NUCLEAR_EQUATION_INVALID');
  const sum=(xs:Nuclide[],k:'A'|'Z')=>xs.reduce((s,x)=>s+x[k],0);
  return sum(input.reactants,'A')===sum(input.products,'A')&&sum(input.reactants,'Z')===sum(input.products,'Z');
}
