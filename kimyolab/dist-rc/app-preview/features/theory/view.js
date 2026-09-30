// P2.3 — presentation model of structured theory. It copies authored text as-is (no rewriting, no generated wording),
// resolves cited source ids to their registered titles and states the review state. It is built only from an entry
// that re-validates in the browser (fail closed: anything else stays MINIMAL). No chemistry is computed here.
import {classifyTheoryDepth,theoryReviewState,                                          } from '../../domain/theory/structured-theory.js';
import {parseSourceRegistry,SOURCE_REGISTRY_SCHEMA} from '../../domain/governance/source-policy.js';
import {createLabeler} from '../practice/form-question.js';
                                                               

                                                 
                                       
                                        
                                                                                          
                                                                         
                                        
                                                                   
                              
                                             
                                                                                                                
                                                                                                                                                                 
 

/** pack = the theory-structured.json pack file; returns the view for `theoryId`, or undefined (→ MINIMAL rendering). */
export function structuredTheoryView(pack        ,theoryId       ,localize         =()=>null)                               {
  const p=pack                                                                                           ;
  if(!p||!Array.isArray(p.entries)) return undefined;
  const entry=p.entries.find((e    )=>e?.theoryId===theoryId)                              ;
  if(!entry) return undefined;
  const {registry}=parseSourceRegistry({schema:SOURCE_REGISTRY_SCHEMA,sources:p.sources??[]});
  if(classifyTheoryDepth({},entry,registry).depth!=='STRUCTURED') return undefined;
  const title=(id       )=>registry.byId.get(id)?.title??id;
  const src=(refs         )=>refs.map(title);
  const cited=[...new Set([entry.explanation,...entry.workedExamples,...entry.misconceptions,entry.summary,...(entry.media??[])].flatMap(b=>b.sourceRefs))];
  return {
    explanation:{text:entry.explanation.text,sources:src(entry.explanation.sourceRefs)},
    workedExamples:entry.workedExamples.map(w=>({problem:w.problem,solutionSteps:[...w.solutionSteps],answer:w.answer,sources:src(w.sourceRefs)})),
    misconceptions:entry.misconceptions.map(m=>({statement:m.statement,correction:m.correction,sources:src(m.sourceRefs)})),
    summary:{points:[...entry.summary.points],sources:src(entry.summary.sourceRefs)},
    media:(entry.media??[]).map(m=>({src:m.src,alt:m.alt,...(m.caption?{caption:m.caption}:{}),sources:src(m.sourceRefs)})),
    reviewState:theoryReviewState(entry),
    labels:(()=>{ const t=createLabeler(localize); const state=theoryReviewState(entry);
      const note={APPROVED:'',REVIEW_PENDING:'ui.theory-review-pending',DRAFT:'ui.theory-review-draft',CHANGES_REQUESTED:'ui.theory-review-changes',STALE_REVIEW:'ui.theory-review-stale'}[state];
      return {explanation:t.ui('ui.theory-explanation'),examples:t.ui('ui.theory-examples'),example:t.ui('ui.theory-example',{n:'{n}'}),problem:t.ui('ui.theory-problem'),steps:t.ui('ui.theory-steps'),answer:t.ui('ui.theory-answer'),misconceptions:t.ui('ui.theory-misconceptions'),wrong:t.ui('ui.theory-wrong'),right:t.ui('ui.theory-right'),summary:t.ui('ui.theory-summary'),sources:t.ui('ui.theory-sources'),source:t.ui('ui.theory-source'),reviewNote:note?t.ui(note):''}; })(),
    sourceList:cited.map(id=>({id,title:title(id)})),
  };
}
