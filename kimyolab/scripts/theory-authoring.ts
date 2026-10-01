// P2.3 — structured theory audit and human authoring queue (ADR-P2-004). MEASUREMENT + EMPTY SLOTS ONLY: nothing
// here writes chemistry, examples, misconceptions or summaries, and nothing is approved. Writes:
//   reports/theory-depth-audit.json                    — depth, block presence, missing blocks, provenance, review
//   review-packets/theory-authoring/queue.json         — 122 units: facts and dependencies, NO priority score
//   review-packets/theory-authoring/units/<lu>.json    — one authoring packet per unit (slots are empty)
//   review-packets/theory-authoring/README.md          — how a person authors, cites and gets it reviewed
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ACCEPTABLE} from '../src/domain/governance/source-policy.ts';
import {classifyTheoryDepth,theoryReviewState,MIN_EXPLANATION_CHARS,STRUCTURED_THEORY_SCHEMA} from '../src/domain/theory/structured-theory.ts';
import {collectStructuredTheory,loadSourceRegistry,STRUCTURED_THEORY_DIR} from './lib/structured-theory.ts';

export const THEORY_PACKET_DIR='review-packets/theory-authoring';
export const THEORY_AUDIT='reports/theory-depth-audit.json';
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

export function buildTheoryAuthoring(root:string){
  const units=readJson(root,'content-src/learning-units.json') as any[];
  const theories=new Map((readJson(root,'content-src/theory-activities.json') as any[]).map(t=>[t.id,t]));
  const links=readJson(root,'content-src/mapping-links.json') as any[];
  const concepts=new Map((readJson(root,'content-src/concepts.json') as any[]).map(c=>[c.id,c]));
  const items=(readJson(root,'content-src/assessment-items.json').items??readJson(root,'content-src/assessment-items.json')) as any[];
  const registry=loadSourceRegistry(root);
  const collected=collectStructuredTheory(root);
  const acceptableSources=[...registry.byId.values()].filter(s=>ACCEPTABLE.chemistry.includes(s.category)).map(s=>({id:s.id,category:s.category,title:s.title}));
  const rows=units.slice().sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).map(u=>{
    const theoryId=links.find(l=>l.learningUnitId===u.id&&l.role==='primary')?.theoryActivityId;
    const theory:any=theoryId?theories.get(theoryId):undefined;
    const c=collected.find(x=>x.entry.theoryId===theoryId);
    const {depth,validation}=classifyTheoryDepth(theory,c?.entry,registry);
    const e:any=c?.entry;
    const blocks={explanation:Boolean(e?.explanation?.text&&e.explanation.text.trim().length>=MIN_EXPLANATION_CHARS),workedExample:(e?.workedExamples??[]).length>0,misconception:(e?.misconceptions??[]).length>0,summary:(e?.summary?.points??[]).length>0};
    return {u,theoryId,theory,entry:e,depth,validation,blocks,review:e?theoryReviewState(e):null};
  });
  const count=(f:(r:any)=>boolean)=>rows.filter(f).length;
  const audit={schema:'kimyolab.theory-depth-audit.v1',
    semantics:`Theory depth per learning unit, from the repository. STRUCTURED = a human-authored entry in ${STRUCTURED_THEORY_DIR}/ that is complete (explanation ≥${MIN_EXPLANATION_CHARS} chars, ≥1 worked example, ≥1 misconception check, a summary) AND cites registered sources of an acceptable category in every block. Templates, placeholders, unsourced or incomplete entries are never STRUCTURED. Review state is governance and is reported separately.`,
    totals:{units:rows.length,MINIMAL:count(r=>r.depth==='MINIMAL'),STRUCTURED:count(r=>r.depth==='STRUCTURED'),NONE:count(r=>r.depth==='NONE'),structuredEntriesAuthored:collected.length},
    blocksPresent:{explanation:count(r=>r.blocks.explanation),workedExample:count(r=>r.blocks.workedExample),misconception:count(r=>r.blocks.misconception),summary:count(r=>r.blocks.summary)},
    missingBlocks:{explanation:count(r=>!r.blocks.explanation),workedExample:count(r=>!r.blocks.workedExample),misconception:count(r=>!r.blocks.misconception),summary:count(r=>!r.blocks.summary)},
    provenance:{entriesFullySourced:collected.filter(c=>c.sourced).length,entriesWithSourceIssues:collected.filter(c=>!c.sourced).length,acceptableSourceCategories:ACCEPTABLE.chemistry,registeredAcceptableSources:acceptableSources.length,unitSourceRefCategories:Object.fromEntries(Object.entries(rows.reduce((m:any,r)=>{ for(const s of r.u.sourceRefs??[]) m[s.type??'unknown']=(m[s.type??'unknown']??0)+1; return m; },{})).sort())},
    humanReview:{legacyTheoryLifecycle:Object.fromEntries(Object.entries(rows.reduce((m:any,r)=>(m[r.theory?.lifecycleStatus??'none']=(m[r.theory?.lifecycleStatus??'none']??0)+1,m),{})).sort()),
      legacyTheoryApprovals:{didacticApproved:count(r=>r.theory?.approvals?.didactic?.status==='approved'),technicalApproved:count(r=>r.theory?.approvals?.technical?.status==='approved')},
      structuredEntries:{APPROVED:count(r=>r.review==='APPROVED'),REVIEW_PENDING:count(r=>r.review==='REVIEW_PENDING'),STALE_REVIEW:count(r=>r.review==='STALE_REVIEW'),DRAFT:count(r=>r.review==='DRAFT'),CHANGES_REQUESTED:count(r=>r.review==='CHANGES_REQUESTED')}},
    units:rows.map(r=>({learningUnitId:r.u.id,theoryId:r.theoryId,depth:r.depth,blocks:r.blocks,structuredEntry:r.entry?{issues:r.validation?.issues.map((i:any)=>i.code)??[],review:r.review}:null})),
  };
  const packets=rows.map(r=>({schema:'kimyolab.theory-authoring-packet.v1',status:r.depth==='STRUCTURED'?'STRUCTURED':'AWAITING_HUMAN_AUTHOR',
    learningUnit:{id:r.u.id,grade:r.u.grade,title:r.u.title,chapter:r.u.chapter??null},
    learningOutcomes:[...r.u.learningOutcomes],
    concepts:r.u.conceptIds.map((id:string)=>({id,name:concepts.get(id)?.name??null})),
    prerequisiteConcepts:r.u.prerequisiteConceptIds.map((id:string)=>({id,name:concepts.get(id)?.name??null})),
    currentTheory:{theoryId:r.theoryId,title:r.theory?.title??null,depth:r.depth,legacyBlocks:(r.theory?.explanationBlocks??[]).map((b:any)=>({type:b.type,text:b.text})),lifecycleStatus:r.theory?.lifecycleStatus??null},
    currentProvenance:{unitSourceRefs:r.u.sourceRefs??[],theorySourceRefs:[],note:'the legacy theory carries no registered source; every structured block must cite one'},
    dependencies:{practiceActivities:links.filter(l=>l.learningUnitId===r.u.id).map(l=>l.practiceActivityId).filter(Boolean),assessmentItems:items.filter(i=>i.learningUnitId===r.u.id).length},
    // EMPTY slots — a person fills them; the platform does not
    slots:{file:`${STRUCTURED_THEORY_DIR}/${r.theoryId}.json`,schema:STRUCTURED_THEORY_SCHEMA,
      explanation:{text:null,minChars:MIN_EXPLANATION_CHARS,sourceRefs:[],authoredBy:null,status:'draft',reviews:[]},
      workedExamples:[{problem:null,solutionSteps:[],answer:null,sourceRefs:[],authoredBy:null,status:'draft',reviews:[]}],
      misconceptions:[{statement:null,correction:null,sourceRefs:[],authoredBy:null,status:'draft',reviews:[]}],
      summary:{points:[],sourceRefs:[],authoredBy:null,status:'draft',reviews:[]}},
    sourceRequirements:{acceptableCategories:ACCEPTABLE.chemistry,rule:'every block cites ≥1 registered source (content-src/source-registry.json) of an acceptable category; register new textbooks/standards through a reviewed PR (docs/governance/SOURCE_POLICY.md)'},
    reviewChecklist:['explanation ≥300 characters, school level, consistent with the cited source','worked example: problem, numbered solution steps and answer are chemically correct and match the source','misconception: a real, documented learner misconception with a correct explanation (not invented)','summary points restate the explanation without new claims','every block cites a registered acceptable source; no placeholder text','approval = an approving chemistry review AND an approving didactic review by two different people, neither the author, both pinned to the same content hash; any edit of text or sources makes them stale'],
  }));
  const queue={schema:'kimyolab.theory-authoring-queue.v1',status:'AWAITING_HUMAN_AUTHOR',
    semantics:'One entry per learning unit with FACTS and DEPENDENCIES only. There is no priority score and no best/worst ordering (units are listed by id); a person decides the order.',
    counts:{units:packets.length,awaitingAuthor:packets.filter(p=>p.status==='AWAITING_HUMAN_AUTHOR').length,structured:packets.filter(p=>p.status==='STRUCTURED').length},
    units:packets.map(p=>({learningUnitId:p.learningUnit.id,grade:p.learningUnit.grade,title:p.learningUnit.title,status:p.status,depth:p.currentTheory.depth,concepts:p.concepts.length,practiceActivities:p.dependencies.practiceActivities.length,assessmentItems:p.dependencies.assessmentItems,packet:`units/${p.learningUnit.id}.json`}))};
  return {audit,queue,packets};
}

function readme(q:any):string{
  return ['# Theory authoring queue','',`Generated by \`scripts/theory-authoring.ts\` — do not edit by hand. ${q.counts.units} learning units; ${q.counts.awaitingAuthor} await a human author.`,'',
    'Each `units/<lu>.json` packet holds the unit facts (outcomes, concepts, current MINIMAL theory, sources, dependencies) and EMPTY slots. The platform does not write explanations, examples or misconceptions.','',
    '## How a unit becomes STRUCTURED','',
    `1. An author writes \`${STRUCTURED_THEORY_DIR}/<theoryId>.json\` (schema \`${STRUCTURED_THEORY_SCHEMA}\`, see \`schemas/structured-theory.schema.json\`).`,
    '2. Every block (explanation, each worked example, each misconception, summary) cites registered sources of an acceptable category and names its human author.',
    '3. `npm run content:pack` validates it: malformed entries (placeholders, missing author, automation author, approval without a hash-pinned review) fail the build; incomplete or unsourced entries stay out of the learner pack.',
    '4. A chemistry reviewer and a didactic reviewer (two different people, neither the author) each add a review pinned to the block\'s current content hash; the block is APPROVED only when both approve the same hash. Any edit makes earlier reviews stale.','',
    '## Queue (by id — no priority score)','','| Unit | Grade | Title | Depth | Concepts | Practices | Items |','|---|---|---|---|---|---|---|',
    ...q.units.map((u:any)=>`| \`${u.learningUnitId}\` | ${u.grade} | ${u.title} | ${u.depth} | ${u.concepts} | ${u.practiceActivities} | ${u.assessmentItems} |`),''].join('\n');
}

export function writeTheoryAuthoring(root:string){
  const {audit,queue,packets}=buildTheoryAuthoring(root);
  const w=(rel:string,v:unknown)=>{ fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true}); fs.writeFileSync(path.join(root,rel),JSON.stringify(v,null,2)+'\n'); };
  w(THEORY_AUDIT,audit); w(`${THEORY_PACKET_DIR}/queue.json`,queue);
  const unitsDir=path.join(root,THEORY_PACKET_DIR,'units'); fs.rmSync(unitsDir,{recursive:true,force:true});
  for(const p of packets) w(`${THEORY_PACKET_DIR}/units/${p.learningUnit.id}.json`,p);
  fs.writeFileSync(path.join(root,THEORY_PACKET_DIR,'README.md'),readme(queue));
  return audit;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const a=writeTheoryAuthoring(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
  console.log(JSON.stringify({totals:a.totals,missingBlocks:a.missingBlocks,review:a.humanReview.structuredEntries}));
}
