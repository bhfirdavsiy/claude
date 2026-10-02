// P2.3 — build-time collection of structured theory (ADR-P2-004). Authored entries live in
// content-src/theory-structured/<theoryId>.json. The JSON Schema IS the STRUCTURED contract, so the build FAILS on an
// incomplete or malformed entry (missing block, short explanation, placeholder text, automation author or reviewer,
// self-review, one person in both review roles, unknown theory/unit); drafts live in the authoring packets. A
// well-formed entry whose sources are not registered/acceptable is kept out of the learner pack and reported — it never
// reaches learners and never counts as STRUCTURED.
import fs from 'node:fs';
import path from 'node:path';
import {createContentAjv} from './content-schema.ts';
import {parseSourceRegistry,type SourceRegistry} from '../../src/domain/governance/source-policy.ts';
import {validateStructuredTheory,theoryReviewState,contentBlocks,STRUCTURED_THEORY_PACK_SCHEMA,type StructuredTheory} from '../../src/domain/theory/structured-theory.ts';
import {canonicalSourceIssues} from '../../src/domain/governance/source-policy.ts';
import {loadGovernedSourceRegistry} from './source-registry.ts';

export const STRUCTURED_THEORY_DIR='content-src/theory-structured';
const MALFORMED=new Set(['SCHEMA','PLACEHOLDER_TEXT','AUTOMATION_AUTHOR','AUTHOR_MISSING','REVIEW_INVALID','REVIEWER_NOT_HUMAN','SELF_REVIEW','SAME_REVIEWER_BOTH_ROLES','DUPLICATE_ROLE_REVIEW','MEDIA_INVALID']);

export interface CollectedTheory { file:string; entry:StructuredTheory; complete:boolean; sourced:boolean; issues:Array<{code:string;where:string}> }

export function loadSourceRegistry(root:string):SourceRegistry{
  return parseSourceRegistry(JSON.parse(fs.readFileSync(path.join(root,'content-src/source-registry.json'),'utf8'))).registry;
}

/** Reads and checks every authored entry; throws STRUCTURED_THEORY_INVALID on anything malformed (fail closed). */
export function collectStructuredTheory(root:string,dir=path.join(root,STRUCTURED_THEORY_DIR)):CollectedTheory[]{
  if(!fs.existsSync(dir)) return [];
  const registry=loadSourceRegistry(root);
  const ajv=createContentAjv(path.join(root,'schemas'));
  const validate=ajv.getSchema('structured-theory.schema.json')!;
  const theories=new Map((JSON.parse(fs.readFileSync(path.join(root,'content-src/theory-activities.json'),'utf8')) as any[]).map(t=>[t.id,t]));
  const links=JSON.parse(fs.readFileSync(path.join(root,'content-src/mapping-links.json'),'utf8')) as any[];
  const out:CollectedTheory[]=[]; const errors:string[]=[]; const seen=new Set<string>();
  for(const name of fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort()){
    const file=`${STRUCTURED_THEORY_DIR}/${name}`;
    let entry:any; try{ entry=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')); }catch{ errors.push(`${file}:JSON`); continue; }
    if(!validate(entry)) errors.push(`${file}:SCHEMA:${(validate.errors??[]).map((e:any)=>`${e.instancePath} ${e.message}`).join('; ')}`);
    if(!theories.has(entry?.theoryId)) errors.push(`${file}:THEORY_UNKNOWN:${entry?.theoryId}`);
    else if(!links.some(l=>l.theoryActivityId===entry.theoryId&&l.learningUnitId===entry.learningUnitId)) errors.push(`${file}:UNIT_MISMATCH:${entry.learningUnitId}`);
    if(name!==`${entry?.theoryId}.json`) errors.push(`${file}:FILE_NAME_MUST_BE_THEORY_ID`);
    if(seen.has(entry?.theoryId)) errors.push(`${file}:DUPLICATE`); seen.add(entry?.theoryId);
    const v=validateStructuredTheory(entry,registry);
    for(const i of v.issues) if(MALFORMED.has(i.code)) errors.push(`${file}:${i.code}:${i.where}`);
    // approval is DERIVED per block (two pinned human reviews); a review of an older revision is STALE, not approval
    out.push({file,entry,complete:v.complete,sourced:v.sourced,issues:v.issues});
  }
  if(errors.length) throw new Error(`STRUCTURED_THEORY_INVALID\n${errors.join('\n')}`);
  return out;
}

/** The learner pack file: only complete AND sourced entries, with the titles/categories of the sources they cite. */
export function structuredTheoryPack(root:string,collected=collectStructuredTheory(root)){
  const registry=loadSourceRegistry(root);
  const shipped=collected.filter(c=>c.complete&&c.sourced).map(c=>c.entry);
  const cited=[...new Set(shipped.flatMap(e=>[e.explanation,...e.workedExamples,...e.misconceptions,e.summary,...(e.media??[])].flatMap(b=>b.sourceRefs)))].sort();
  return {schema:STRUCTURED_THEORY_PACK_SCHEMA,entries:shipped.sort((a,b)=>a.theoryId.localeCompare(b.theoryId)),sources:cited.map(id=>registry.byId.get(id)!).map(s=>({id:s.id,category:s.category,title:s.title}))};
}

/** P2.4 (ADR-P2-005): canonical structured theory enters the repository only through the governed apply
 *  (npm run theory:apply), which requires every block to be dual-review APPROVED and every cited source to be
 *  canonical-authoring eligible (registered, category-compatible AND human-accepted, pinned to its reviewed intake —
 *  P2.4 closeout A1). The repository build and validation re-check both, so a hand-written or edited canonical file,
 *  or one citing a merely PROPOSED source, fails closed. */
export function assertCanonicalTheoryApproved(collected:CollectedTheory[],root:string){
  const {registry}=loadGovernedSourceRegistry(root);
  const bad=collected.flatMap(c=>{
    const review=theoryReviewState(c.entry);
    const out=review!=='APPROVED'?[`${c.file}:NOT_APPROVED:${review}`]:[];
    for(const {name,block} of contentBlocks(c.entry)) for(const i of canonicalSourceIssues(block.sourceRefs??[],registry)) out.push(`${c.file}:${i.code}:${name}:${i.ref}`);
    return out;
  });
  if(bad.length) throw new Error(`CANONICAL_THEORY_NOT_APPROVED (use npm run theory:apply)\n${bad.join('\n')}`);
  return collected;
}
