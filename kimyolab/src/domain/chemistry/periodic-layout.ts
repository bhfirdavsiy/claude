// P2.13 — positions in the periodic table, DERIVED from the canonical atomic number (periodic-table.ts stays the one
// identity source: no second element list exists here or anywhere else). Two things are kept strictly apart:
//
//   chemical period — the shell the element's outermost electrons fill: 1…7, decided by the period-closing atomic
//                     numbers (2, 10, 18, 36, 54, 86, 118)
//   display row     — where the 18-column layout draws the cell; the f-block (Z 57–71, 89–103) is drawn in two separate
//                     rows 9 and 10 BELOW the main table. A display row is never a period (La is period 6, drawn in row 9).
//
// Group numbers (IUPAC 1–18) follow from the same layout for the s-, p- and d-block. The f-block has no group number
// here: which of La/Lu (Ac/Lr) belongs to group 3 is a convention the repository has no reviewed source for, so the
// group stays null for the whole range 57–71 / 89–103 instead of being chosen silently.
import {MAX_ATOMIC_NUMBER} from './periodic-table.ts';

/** atomic numbers that close each period (the noble gases), index = period − 1 */
export const PERIOD_CLOSING_Z:readonly number[]=Object.freeze([2,10,18,36,54,86,118]);
/** the two f-block ranges drawn below the main table */
export const F_BLOCK_RANGES:readonly (readonly [number,number])[]=Object.freeze([Object.freeze([57,71] as const),Object.freeze([89,103] as const)]);

const valid=(z:number)=>Number.isInteger(z)&&z>=1&&z<=MAX_ATOMIC_NUMBER;
const assertZ=(z:number)=>{ if(!valid(z)) throw new Error('ATOMIC_NUMBER_INVALID'); };

export function isFBlock(z:number):boolean{ assertZ(z); return F_BLOCK_RANGES.some(([a,b])=>z>=a&&z<=b); }

/** chemical period 1…7 */
export function chemicalPeriod(z:number):number{
  assertZ(z);
  return PERIOD_CLOSING_Z.findIndex(end=>z<=end)+1;
}

/** IUPAC group 1…18 for the s-, p- and d-block; null for the f-block (no reviewed convention, see header) */
export function groupNumber(z:number):number|null{
  const p=chemicalPeriod(z);
  if(isFBlock(z)) return null;
  const start=p===1?1:PERIOD_CLOSING_Z[p-2]!+1, offset=z-start;
  if(p===1) return z===1?1:18;
  if(p<=3) return offset<2?offset+1:offset+11;          // s: 1–2, p: 13–18
  if(p<=5) return offset+1;                              // 18 elements in order
  return offset<2?offset+1:offset-13;                    // s: 1–2, (f-block skipped above), d+p: 4–18
}

export interface DisplayPosition { row:number; column:number; fBlockRow:boolean }

/** Where the 18-column layout draws the cell. Rows 1–7 are the main table; rows 9–10 hold the f-block. */
export function displayPosition(z:number):DisplayPosition{
  const p=chemicalPeriod(z);
  if(isFBlock(z)){ const [a]=F_BLOCK_RANGES.find(([s,e])=>z>=s&&z<=e)!; return {row:p===6?9:10,column:z-a+3,fBlockRow:true}; }
  return {row:p,column:groupNumber(z)!,fBlockRow:false};
}
