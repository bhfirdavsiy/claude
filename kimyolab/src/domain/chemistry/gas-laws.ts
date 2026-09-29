const R=8.31446261815324; // kPa·L·mol−1·K−1
export function idealGasPressure(input:{moles:number;temperatureK:number;volumeL:number}):number{
  if(!(input.moles>0)||!(input.temperatureK>0)||!(input.volumeL>0)) throw new Error('GAS_INPUT_INVALID');
  return input.moles*R*input.temperatureK/input.volumeL;
}
export function totalGasMoles(values:number[]):number{
  if(!Array.isArray(values)||values.some(x=>!Number.isFinite(x)||x<0)) throw new Error('GAS_INPUT_INVALID');
  return values.reduce((s,x)=>s+x,0);
}
