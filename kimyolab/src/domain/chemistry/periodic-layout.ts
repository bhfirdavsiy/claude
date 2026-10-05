// P2.13 — the DISPLAY LAYOUT of the periodic table: where each cell is drawn in the 18-column grid. Identity comes from
// periodic-table.ts (no second element list). The rule below encodes scientific periodic-table knowledge (where rows
// close, how columns are filled), which canonical identity alone does not prove, so it is used ONLY to place cells.
// It is never shown to a learner as a chemical period or group: those are scientific claims that need a registered,
// human-accepted source and a human review on the exact rule (scripts/lib/element-governance.ts, ADR-P2-014 §3a);
// until then the learner profile says the period and group are not yet confirmed.
//
//   layout row    — 1…7: the main-table row band of the cell
//   display row   — where the cell is drawn: rows 1–7, and rows 9 / 10 for the two f-block ranges drawn apart
//   layout column — 1…18 for the main table; null for the f-block (drawn in the separate rows)
import {MAX_ATOMIC_NUMBER} from './periodic-table.ts';

/** atomic numbers that close each layout row, index = row − 1 */
export const LAYOUT_ROW_CLOSING_Z:readonly number[]=Object.freeze([2,10,18,36,54,86,118]);
/** the two ranges drawn below the main table */
export const F_BLOCK_RANGES:readonly (readonly [number,number])[]=Object.freeze([Object.freeze([57,71] as const),Object.freeze([89,103] as const)]);
/** the whole rule as data — what a scientific review of period / group would have to approve (hashed by the build) */
export const LAYOUT_RULE=Object.freeze({rowClosingZ:LAYOUT_ROW_CLOSING_Z,fBlockRanges:F_BLOCK_RANGES,columns:'row 1: Z1→1, Z2→18; rows 2–3: s→1–2, p→13–18; rows 4–5: in order 1–18; rows 6–7: s→1–2, f-block apart, then 4–18'});

const valid=(z:number)=>Number.isInteger(z)&&z>=1&&z<=MAX_ATOMIC_NUMBER;
const assertZ=(z:number)=>{ if(!valid(z)) throw new Error('ATOMIC_NUMBER_INVALID'); };

export function isFBlock(z:number):boolean{ assertZ(z); return F_BLOCK_RANGES.some(([a,b])=>z>=a&&z<=b); }

/** layout row 1…7 */
export function layoutRow(z:number):number{
  assertZ(z);
  return LAYOUT_ROW_CLOSING_Z.findIndex(end=>z<=end)+1;
}

/** layout column 1…18; null for the f-block */
export function layoutColumn(z:number):number|null{
  const p=layoutRow(z);
  if(isFBlock(z)) return null;
  const start=p===1?1:LAYOUT_ROW_CLOSING_Z[p-2]!+1, offset=z-start;
  if(p===1) return z===1?1:18;
  if(p<=3) return offset<2?offset+1:offset+11;
  if(p<=5) return offset+1;
  return offset<2?offset+1:offset-13;
}

export interface DisplayPosition { row:number; column:number; fBlockRow:boolean }

/** Where the 18-column layout draws the cell. Rows 1–7 are the main table; rows 9–10 hold the f-block. */
export function displayPosition(z:number):DisplayPosition{
  const p=layoutRow(z);
  if(isFBlock(z)){ const [a]=F_BLOCK_RANGES.find(([s,e])=>z>=s&&z<=e)!; return {row:p===6?9:10,column:z-a+3,fBlockRow:true}; }
  return {row:p,column:layoutColumn(z)!,fBlockRow:false};
}
