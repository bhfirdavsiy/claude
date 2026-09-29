                                           
export function validateNuclearEquation(input                                         )        {
  if(!input.reactants.length||!input.products.length) throw new Error('NUCLEAR_EQUATION_INVALID');
  const sum=(xs          ,k        )=>xs.reduce((s,x)=>s+x[k],0);
  return sum(input.reactants,'A')===sum(input.products,'A')&&sum(input.reactants,'Z')===sum(input.products,'Z');
}
