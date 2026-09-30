// The ONE periodic-table source of the domain (P1.4 §6): atomic number → element. Symbols are listed in
// atomic-number order (index = Z − 1). The formula parser and the atom model both read this list; there is no
// second element table anywhere (the former table inside the atom-builder adapter was removed).

export const ELEMENT_SYMBOLS:readonly string[]=Object.freeze(`H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og`.split(' '));

export const MAX_ATOMIC_NUMBER=ELEMENT_SYMBOLS.length;

/** Uzbek (Latin) school names for the first 20 elements; beyond that the symbol is the name shown. */
const NAMES_UZ:readonly string[]=Object.freeze(['Vodorod','Geliy','Litiy','Berilliy','Bor','Uglerod','Azot','Kislorod','Ftor','Neon','Natriy','Magniy','Alyuminiy','Kremniy','Fosfor','Oltingugurt','Xlor','Argon','Kaliy','Kalsiy']);

export interface ElementInfo { atomicNumber:number; symbol:string; nameUz:string }

export const ELEMENT_SYMBOL_SET:ReadonlySet<string>=new Set(ELEMENT_SYMBOLS);

/** Element with atomic number Z (1…118), or undefined — callers decide how to fail. */
export function elementByAtomicNumber(atomicNumber:number):ElementInfo|undefined{
  if(!Number.isInteger(atomicNumber)||atomicNumber<1||atomicNumber>MAX_ATOMIC_NUMBER) return undefined;
  const symbol=ELEMENT_SYMBOLS[atomicNumber-1]!;
  return {atomicNumber,symbol,nameUz:NAMES_UZ[atomicNumber-1]??symbol};
}
