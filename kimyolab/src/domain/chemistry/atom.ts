// Canonical atom model (P1.4 §7). Every derived quantity of an atom — Z, A, charge, element, isotope — is
// computed HERE and nowhere else; renderers only display it.
//
//   atomicNumber = protons   massNumber = protons + neutrons   charge = protons − electrons
//
// Fail closed: particle counts must be non-negative integers (ATOM_PARTICLES_INVALID) and the atomic number
// must be a known element or 0 (ATOM_ATOMIC_NUMBER_UNSUPPORTED). Z = 0 is the empty starting state of the
// builder: it has no element and no isotope (never a made-up "Z0").
import {elementByAtomicNumber,MAX_ATOMIC_NUMBER} from './periodic-table.ts';

export type Particle='protons'|'neutrons'|'electrons';
export const PARTICLES:readonly Particle[]=['protons','neutrons','electrons'];

export interface ParticleCounts { protons:number; neutrons:number; electrons:number }

export interface AtomState extends ParticleCounts {
  atomicNumber:number;
  massNumber:number;
  charge:number;
  /** element symbol, or null while Z = 0 */
  element:string|null;
  /** school name of the element (Uzbek), or null while Z = 0 */
  elementName:string|null;
  /** e.g. "C-14", or null while Z = 0 */
  isotope:string|null;
}

/** Upper bounds the builder can reach (protons: the known elements). Inputs beyond them are not applied. */
export const ATOM_LIMITS:Readonly<Record<Particle,number>>=Object.freeze({protons:MAX_ATOMIC_NUMBER,neutrons:200,electrons:MAX_ATOMIC_NUMBER+10});

export function deriveAtomState(counts:ParticleCounts):AtomState{
  for(const p of PARTICLES){
    const v=(counts as any)?.[p];
    if(!Number.isInteger(v)||v<0) throw new Error(`ATOM_PARTICLES_INVALID:${p}`);
  }
  const {protons,neutrons,electrons}=counts;
  const atomicNumber=protons;
  const element=atomicNumber===0?undefined:elementByAtomicNumber(atomicNumber);
  if(atomicNumber!==0&&!element) throw new Error(`ATOM_ATOMIC_NUMBER_UNSUPPORTED:${atomicNumber}`);
  const massNumber=protons+neutrons;
  return {
    protons,neutrons,electrons,atomicNumber,massNumber,charge:protons-electrons,
    element:element?.symbol??null,elementName:element?.nameUz??null,
    isotope:element?`${element.symbol}-${massNumber}`:null,
  };
}

/**
 * The builder's reducer step: one particle up or down. Counts never go below 0 or above ATOM_LIMITS — such an
 * input leaves the state unchanged (the pre-P1.4 builder clamped the same way, so learning semantics are kept).
 */
export function applyParticleDelta(state:ParticleCounts,particle:Particle,delta:number):AtomState{
  if(!PARTICLES.includes(particle)||!Number.isInteger(delta)) throw new Error('ATOM_ACTION_INVALID');
  const next={protons:state.protons,neutrons:state.neutrons,electrons:state.electrons};
  next[particle]=Math.min(ATOM_LIMITS[particle],Math.max(0,next[particle]+delta));
  return deriveAtomState(next);
}
