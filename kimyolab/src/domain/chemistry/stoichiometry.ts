export const AVOGADRO=6.02214076e23;
function positive(...xs:number[]){if(xs.some(x=>!Number.isFinite(x)||x<=0)) throw new Error('STOICHIOMETRY_INPUT_INVALID');}
export function molesFromMass(massG:number,molarMassGPerMol:number){positive(massG,molarMassGPerMol);return massG/molarMassGPerMol;}
export function particlesFromMoles(moles:number){positive(moles);return moles*AVOGADRO;}
export function massPercent(soluteMassG:number,solutionMassG:number){positive(soluteMassG,solutionMassG);if(soluteMassG>solutionMassG)throw new Error('STOICHIOMETRY_INPUT_INVALID');return soluteMassG/solutionMassG*100;}
export function molarity(moles:number,volumeL:number){positive(moles,volumeL);return moles/volumeL;}
export function normality(molarityValue:number,equivalentFactor:number){positive(molarityValue,equivalentFactor);return molarityValue*equivalentFactor;}
