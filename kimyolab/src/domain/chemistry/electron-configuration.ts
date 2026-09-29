const ORBITALS:[string,number][]=[['1s',2],['2s',2],['2p',6],['3s',2],['3p',6],['4s',2],['3d',10],['4p',6]];
export function electronConfiguration(atomicNumber:number):string{
  if(!Number.isInteger(atomicNumber)||atomicNumber<1||atomicNumber>36) throw new Error('ATOMIC_NUMBER_INVALID');
  let remaining=atomicNumber; const parts:string[]=[];
  for(const [orbital,capacity] of ORBITALS){if(remaining<=0)break;const count=Math.min(capacity,remaining);parts.push(`${orbital}${count}`);remaining-=count;}
  if(remaining!==0) throw new Error('ELECTRON_CONFIGURATION_NOT_MODELED');
  return parts.join(' ');
}
