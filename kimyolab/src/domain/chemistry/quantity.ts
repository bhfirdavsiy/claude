export type UnitId = 'g'|'kg'|'mol'|'L'|'mL'|'Pa'|'kPa'|'°C'|'K'|'mol/L'|'%'|'C'|'A'|'s';
export interface Quantity { value: number; unit: UnitId }

type UnitDef = { dimension: string; toBase: (value:number)=>number; fromBase:(value:number)=>number };
const UNITS: Record<UnitId, UnitDef> = {
  g:{dimension:'mass',toBase:v=>v,fromBase:v=>v},
  kg:{dimension:'mass',toBase:v=>v*1000,fromBase:v=>v/1000},
  mol:{dimension:'amount',toBase:v=>v,fromBase:v=>v},
  L:{dimension:'volume',toBase:v=>v,fromBase:v=>v},
  mL:{dimension:'volume',toBase:v=>v/1000,fromBase:v=>v*1000},
  Pa:{dimension:'pressure',toBase:v=>v,fromBase:v=>v},
  kPa:{dimension:'pressure',toBase:v=>v*1000,fromBase:v=>v/1000},
  '°C':{dimension:'temperature',toBase:v=>v+273.15,fromBase:v=>v-273.15},
  K:{dimension:'temperature',toBase:v=>v,fromBase:v=>v},
  'mol/L':{dimension:'concentration',toBase:v=>v,fromBase:v=>v},
  '%':{dimension:'percentage',toBase:v=>v,fromBase:v=>v},
  C:{dimension:'charge',toBase:v=>v,fromBase:v=>v},
  A:{dimension:'current',toBase:v=>v,fromBase:v=>v},
  s:{dimension:'time',toBase:v=>v,fromBase:v=>v},
};

export function convertQuantity(quantity: Quantity, targetUnit: UnitId): Quantity {
  const source = UNITS[quantity.unit];
  const target = UNITS[targetUnit];
  if (!source || !target || source.dimension !== target.dimension) throw new Error('UNIT_INCOMPATIBLE');
  return { value: target.fromBase(source.toBase(quantity.value)), unit: targetUnit };
}

export function nearlyEqualQuantity(actual: Quantity, expected: Quantity, tolerance: Quantity): boolean {
  const actualConverted = convertQuantity(actual, expected.unit);
  const toleranceConverted = convertQuantity(tolerance, expected.unit);
  return Math.abs(actualConverted.value - expected.value) <= Math.abs(toleranceConverted.value);
}

export function roundSignificant(value:number, figures:number): number {
  if (!Number.isFinite(value) || !Number.isInteger(figures) || figures < 1) throw new Error('PRECISION_INVALID');
  if (value === 0) return 0;
  const power = figures - 1 - Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** power;
  return Math.round(value * factor) / factor;
}
