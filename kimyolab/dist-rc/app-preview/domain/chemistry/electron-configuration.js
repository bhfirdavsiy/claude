const ORBITALS                  =[['1s',2],['2s',2],['2p',6],['3s',2],['3p',6],['4s',2],['3d',10],['4p',6]];
export function electronConfiguration(atomicNumber       )       {
  if(!Number.isInteger(atomicNumber)||atomicNumber<1||atomicNumber>36) throw new Error('ATOMIC_NUMBER_INVALID');
  let remaining=atomicNumber; const parts         =[];
  for(const [orbital,capacity] of ORBITALS){if(remaining<=0)break;const count=Math.min(capacity,remaining);parts.push(`${orbital}${count}`);remaining-=count;}
  if(remaining!==0) throw new Error('ELECTRON_CONFIGURATION_NOT_MODELED');
  return parts.join(' ');
}

// P2.13 — what the element profile may show. The engine above fills the orbitals in one fixed order and models only
// Z 1–36; it holds no exception records. The repository's own known-gap record (scripts/lib/computed-model-interaction.ts,
// P2.6 MODEL_KNOWN_GAP) names Z=24 and Z=29 as the outputs that need chemistry review, so those are NOT shown either.
// Nothing outside this range is estimated: the profile says the configuration is not available.
export const ELECTRON_CONFIGURATION_RANGE=Object.freeze({min:1,max:36});
export const ELECTRON_CONFIGURATION_KNOWN_GAPS                  =Object.freeze([24,29]);
                                        
                                    
                                                                            
export function electronConfigurationStatus(atomicNumber       )                            {
  if(ELECTRON_CONFIGURATION_KNOWN_GAPS.includes(atomicNumber)) return {status:'UNAVAILABLE',reason:'ENGINE_KNOWN_GAP'};
  if(!Number.isInteger(atomicNumber)||atomicNumber<ELECTRON_CONFIGURATION_RANGE.min||atomicNumber>ELECTRON_CONFIGURATION_RANGE.max) return {status:'UNAVAILABLE',reason:'OUTSIDE_ENGINE_RANGE'};
  return {status:'COMPUTED',value:electronConfiguration(atomicNumber)};
}
