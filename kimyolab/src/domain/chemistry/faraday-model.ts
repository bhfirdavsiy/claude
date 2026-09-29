const F=96485.33212;
export function faradayMass(input:{molarMassGPerMol:number;currentA:number;timeS:number;electronNumber:number}):number{
  if(!(input.molarMassGPerMol>0)||!(input.currentA>0)||!(input.timeS>0)||!Number.isInteger(input.electronNumber)||input.electronNumber<=0) throw new Error('FARADAY_INPUT_INVALID');
  return input.molarMassGPerMol*input.currentA*input.timeS/(input.electronNumber*F);
}
