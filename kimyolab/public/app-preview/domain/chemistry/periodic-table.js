// The ONE periodic-table source of the domain (P1.4 §6): atomic number → element symbol. Symbols are listed in
// atomic-number order (index = Z − 1). The formula parser and the atom model both read this list; there is no
// second element table anywhere (the former table inside the atom-builder adapter was removed).
//
// Chemical IDENTITY only (P1.4 closeout): Z and the IUPAC symbol. Learner-facing element NAMES are localized
// text and live in content (content-src/locales/<locale>/chemistry-elements.json, CHEM-033 review surface);
// nothing in the domain depends on a name. See ADR-P1-005 addendum for why the 118 symbols are code.

export const ELEMENT_SYMBOLS                  =Object.freeze(`H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og`.split(' '));

export const MAX_ATOMIC_NUMBER=ELEMENT_SYMBOLS.length;


                                                                   

export const ELEMENT_SYMBOL_SET                    =new Set(ELEMENT_SYMBOLS);

/** Element with atomic number Z (1…118), or undefined — callers decide how to fail. */
export function elementByAtomicNumber(atomicNumber       )                      {
  if(!Number.isInteger(atomicNumber)||atomicNumber<1||atomicNumber>MAX_ATOMIC_NUMBER) return undefined;
  const symbol=ELEMENT_SYMBOLS[atomicNumber-1] ;
  return {atomicNumber,symbol};
}
