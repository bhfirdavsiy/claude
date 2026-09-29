export const AVOGADRO=6.02214076e23;
function positive(...xs         ){if(xs.some(x=>!Number.isFinite(x)||x<=0)) throw new Error('STOICHIOMETRY_INPUT_INVALID');}
export function molesFromMass(massG       ,molarMassGPerMol       ){positive(massG,molarMassGPerMol);return massG/molarMassGPerMol;}
export function particlesFromMoles(moles       ){positive(moles);return moles*AVOGADRO;}
export function massPercent(soluteMassG       ,solutionMassG       ){positive(soluteMassG,solutionMassG);if(soluteMassG>solutionMassG)throw new Error('STOICHIOMETRY_INPUT_INVALID');return soluteMassG/solutionMassG*100;}
export function molarity(moles       ,volumeL       ){positive(moles,volumeL);return moles/volumeL;}
export function normality(molarityValue       ,equivalentFactor       ){positive(molarityValue,equivalentFactor);return molarityValue*equivalentFactor;}
