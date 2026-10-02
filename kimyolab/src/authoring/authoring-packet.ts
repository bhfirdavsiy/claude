// P2.4 — the theory authoring packet as the one round-trip format between the reviewer workbench, the repository
// packets (review-packets/theory-authoring/units/<lu>.json) and the governed apply (ADR-P2-005). Browser-safe: the
// workbench runs exactly this code, so a hash it shows is the hash the apply checks.
//
// A packet carries the unit FACTS (read-only) and the SLOTS a person fills. Converting slots → entry only drops the
// slot hints (minChars); it never reorders, rewrites or completes authored text.
import {STRUCTURED_THEORY_SCHEMA,blockContentHash,contentBlocks} from '../domain/theory/structured-theory.ts';

export const THEORY_PACKET_SCHEMA='kimyolab.theory-authoring-packet.v1';
export type PacketIssue='PACKET_SCHEMA'|'PACKET_UNIT_MISSING'|'PACKET_THEORY_MISSING'|'PACKET_VERSION_MISSING'|'PACKET_HASH_MISMATCH';

const block=(b:any)=>{ if(!b||typeof b!=='object') return b; const {minChars,...rest}=b; return rest; };

/** The structured-theory entry the slots describe (or null with the reason). */
export function packetToEntry(packet:any):{entry:any|null;issues:PacketIssue[]}{
  const issues:PacketIssue[]=[];
  if(!packet||packet.schema!==THEORY_PACKET_SCHEMA||!packet.slots||typeof packet.slots!=='object') return {entry:null,issues:['PACKET_SCHEMA']};
  const s=packet.slots;
  if(typeof packet.learningUnit?.id!=='string') issues.push('PACKET_UNIT_MISSING');
  if(typeof packet.currentTheory?.theoryId!=='string') issues.push('PACKET_THEORY_MISSING');
  if(typeof s.version!=='string'||!s.version.trim()) issues.push('PACKET_VERSION_MISSING');
  const entry:any={schema:STRUCTURED_THEORY_SCHEMA,theoryId:packet.currentTheory?.theoryId,learningUnitId:packet.learningUnit?.id,version:s.version,
    explanation:block(s.explanation),workedExamples:(s.workedExamples??[]).map(block),misconceptions:(s.misconceptions??[]).map(block),summary:block(s.summary)};
  if(Array.isArray(s.media)&&s.media.length) entry.media=s.media;
  if(packet.contentHashes&&JSON.stringify(packet.contentHashes)!==JSON.stringify(entryHashes(entry))) issues.push('PACKET_HASH_MISMATCH');
  return {entry,issues};
}

/** Per-block content hashes (the value each review must pin), keyed by block name. */
export function entryHashes(entry:any):Record<string,string>{
  return Object.fromEntries(contentBlocks(entry).map(({name,block})=>[name,blockContentHash(block)]));
}

/** The packet with its slots taken from an entry (canonical content or a workbench edit), hashes refreshed. */
export function packetWithEntry(packet:any,entry:any):any{
  const minChars=packet?.slots?.explanation?.minChars;
  const slots:any={...packet.slots,version:entry.version??null,
    explanation:{...entry.explanation,...(minChars!==undefined?{minChars}:{})},
    workedExamples:entry.workedExamples,misconceptions:entry.misconceptions,summary:entry.summary};
  if(entry.media) slots.media=entry.media; else delete slots.media;
  return {...packet,slots,contentHashes:entryHashes(entry)};
}
