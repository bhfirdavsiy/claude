// P2.3 — presentation model of structured theory. It copies authored text as-is (no rewriting, no generated wording),
// resolves cited source ids to their registered titles and states the review state. It is built only from an entry
// that re-validates in the browser (fail closed: anything else stays MINIMAL). No chemistry is computed here.
import {classifyTheoryDepth,theoryReviewState,type StructuredTheory} from '../../domain/theory/structured-theory.ts';
import {parseSourceRegistry,SOURCE_REGISTRY_SCHEMA} from '../../domain/governance/source-policy.ts';

export interface SourcedText { sources:string[] }
export interface StructuredTheoryView {
  explanation:SourcedText&{text:string};
  workedExamples:Array<SourcedText&{problem:string;solutionSteps:string[];answer:string}>;
  misconceptions:Array<SourcedText&{statement:string;correction:string}>;
  summary:SourcedText&{points:string[]};
  media:Array<SourcedText&{src:string;alt:string;caption?:string}>;
  reviewState:'APPROVED'|'REVIEW_PENDING'|'CHANGES_REQUESTED'|'DRAFT';
  sourceList:Array<{id:string;title:string}>;
}

/** pack = the theory-structured.json pack file; returns the view for `theoryId`, or undefined (→ MINIMAL rendering). */
export function structuredTheoryView(pack:unknown,theoryId:string):StructuredTheoryView|undefined{
  const p=pack as {entries?:unknown[];sources?:Array<{id:string;category:string;title:string}>}|undefined;
  if(!p||!Array.isArray(p.entries)) return undefined;
  const entry=p.entries.find((e:any)=>e?.theoryId===theoryId) as StructuredTheory|undefined;
  if(!entry) return undefined;
  const {registry}=parseSourceRegistry({schema:SOURCE_REGISTRY_SCHEMA,sources:p.sources??[]});
  if(classifyTheoryDepth({},entry,registry).depth!=='STRUCTURED') return undefined;
  const title=(id:string)=>registry.byId.get(id)?.title??id;
  const src=(refs:string[])=>refs.map(title);
  const cited=[...new Set([entry.explanation,...entry.workedExamples,...entry.misconceptions,entry.summary,...(entry.media??[])].flatMap(b=>b.sourceRefs))];
  return {
    explanation:{text:entry.explanation.text,sources:src(entry.explanation.sourceRefs)},
    workedExamples:entry.workedExamples.map(w=>({problem:w.problem,solutionSteps:[...w.solutionSteps],answer:w.answer,sources:src(w.sourceRefs)})),
    misconceptions:entry.misconceptions.map(m=>({statement:m.statement,correction:m.correction,sources:src(m.sourceRefs)})),
    summary:{points:[...entry.summary.points],sources:src(entry.summary.sourceRefs)},
    media:(entry.media??[]).map(m=>({src:m.src,alt:m.alt,...(m.caption?{caption:m.caption}:{}),sources:src(m.sourceRefs)})),
    reviewState:theoryReviewState(entry),
    sourceList:cited.map(id=>({id,title:title(id)})),
  };
}
