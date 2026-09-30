// P2.1 — learner interaction reliability audit. MEASUREMENT of the real browser path (buildPracticeUiModel →
// FormQuestionModel → ReferencePracticeSession); it changes no content. Writes:
//   reports/learner-answer-input-audit.json — every answer field: typed or chosen, its canonical domain and category
//   reports/learner-label-audit.json        — every learner-facing label id: where shown, source, category, gaps
//   reports/interaction-reliability.json    — crash / raw-id / internal-token / closed-domain / localization counts
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSources} from './learning-readiness.ts';
import {compileReadiness} from './lib/readiness-compile.ts';
import {launchDecision} from '../src/domain/readiness/readiness.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {diskFetch} from './pilot-status.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {answerDomainOf,categoryOfDomain,type AnswerCategory} from '../src/features/practice/answer-domain.ts';
import {classifyLearnerOutcome} from '../src/runtime/shared/learner-input.ts';
import {hardcodedUzbek} from './lib/learning-depth.ts';
import {REQUIRED_UI_KEYS} from '../src/features/localization/element-names.ts';

/** The P2.0 measurement these numbers are compared with (reports/learning-depth-baseline.json at the P2.0 merge
 *  41029a7) — cited, not recomputed: the P2.0 UI no longer exists on this branch. */
export const P20_BASELINE=Object.freeze({source:'reports/learning-depth-baseline.json @ 41029a7 (P2.0 merge)',crashOnLearnerInput:1,crashActivities:['practice.simulation.9.23.planned'],rawIdLabelActivities:67,untranslatedTokenActivities:35,hardcodedUzbekLiterals:174,hardcodedUzbekFiles:23,migratedFiles:{'src/features/practice/render.ts':12,'src/features/practice/ui-model.ts':6}});

export const INTERACTION_REPORTS=['reports/learner-answer-input-audit.json','reports/learner-label-audit.json','reports/interaction-reliability.json'] as const;
const INTERNAL_TOKEN=/^[a-z][a-z_-]{2,}$/;
/** Learner input the probe sends to every answer field: typos, other scripts, empty, huge, markup, numbers. */
export const PROBE_INPUTS:ReadonlyArray<string|number|boolean>=Object.freeze(['','   ','kislotali','ACIDIC','кислотная','x'.repeat(400),'<img src=x onerror=alert(1)>','12345','-1','0',-1e9,Number.NaN,true,false,'null','undefined','{"a":1}','💥']);

const FIELD_CATEGORY:Record<string,AnswerCategory>={shift:'PROCESS',pressure:'PROCESS',rate:'PROCESS',effect:'PROCESS',treatment:'PROCESS',medium:'MEDIUM',product:'SPECIES',species:'SPECIES',substance:'SPECIES',sample:'SPECIES',electrolyte:'SPECIES'};
const categoryOfField=(field:string,value:string):AnswerCategory=>/-repeat-unit$/.test(value)?'POLYMER_STRUCTURE':FIELD_CATEGORY[field]??(INTERNAL_TOKEN.test(value)?'ENUM':'OTHER');
const answerShape=(v:unknown):string=>typeof v==='number'?'NUMERIC':typeof v==='boolean'||v==='true'||v==='false'?'BOOLEAN':v===undefined||v===''?'UNKNOWN':INTERNAL_TOKEN.test(String(v))?'INTERNAL_TOKEN':/^[-+]?\d+(?:[.,]\d+)?$/.test(String(v))?'NUMERIC':/[A-Z]/.test(String(v))?'FORMULA_OR_SYMBOL':'AUTHORED_TEXT';
const labelCategory=(ns:string,id:string)=>ns==='action'?'action':ns==='field'?'internal config key':ns==='step'?'concept':ns==='answer'?'option token':/oxidation|absorption|catalyst/.test(id)?'reaction':/^(water|oxygen|salt|brine|limestone|ammonia|iron-ore|coke)$/.test(id)?'species':'concept';

async function probe(model:any,command:(v:any)=>any){
  const out:{input:string;category:string}[]=[];let crashes=0;const errors:string[]=[];
  for(const v of PROBE_INPUTS){
    const s=new ReferencePracticeSession(model,{now:()=>'2026-01-01T00:00:00.000Z'});
    try{ const r=await s.apply(command(v)); out.push({input:typeof v==='string'?v.slice(0,24):String(v),category:classifyLearnerOutcome(r)}); }
    catch(e:any){ crashes++; errors.push(String(e?.message).split(':')[0]!); }
  }
  return {crashes,errors:[...new Set(errors)],categories:[...new Set(out.map(x=>x.category))].sort()};
}

/** Value the engine expects — used ONLY by this audit to categorize the answer, never by the UI. */
async function engineExpected(model:any,command:any){
  try{ const r=await new ReferencePracticeSession(model,{now:()=>'2026-01-01T00:00:00.000Z'}).apply(command); if(r?.expected!==undefined) return r.expected; return JSON.parse(r?.serializedState??'{}').expected; }catch{ return undefined; }
}

export async function buildInteractionReports(root:string){
  const src=loadSources(root); const {pack}=compileReadiness(src);
  const client=new ContentClient({fetchImpl:diskFetch(root) as any,baseUrl:'/content'});
  const answers:any[]=[], labels:any[]=[], activities:any[]=[];
  let launchable=0, rendererOwned=0; const promptLeaks:string[]=[];
  for(const a of src.activities as any[]){
    const readiness=pack.activities.find((x:any)=>x.activityId===a.id);
    if(!launchDecision(readiness).allowed) continue;
    launchable++;
    let model:any; try{ model=await client.loadPractice(a.id); }catch{ continue; }
    if(model.executionPlan.rendererRequirement){ rendererOwned++; continue; }
    const ui:any=buildPracticeUiModel(model); const c=model.referenceConfig; const lu=model.learningUnit.id;
    const row:any={activityId:a.id,learningUnitId:lu,kind:ui.kind,runtime:model.executionPlan.runtime,crashes:0,crashErrors:[],probeCategories:[],localizationMissing:[...ui.localizationMissing]};
    const questions=ui.kind==='simulation'?ui.controls.map((x:any)=>({q:x.question,cmd:(v:any)=>({kind:'simulation-action',action:{field:x.field,value:v}})})):ui.kind==='trainer'?[{q:ui.question,cmd:(v:any)=>({kind:'trainer-answer',answer:String(v)})}]:ui.kind==='calculation'?ui.steps.map((s:any)=>({q:{id:s.id,label:s.label,valueType:'number',input:{kind:'number'}},cmd:(v:any)=>({kind:'calculation-response',response:{stepId:s.id,value:Number(v),unit:s.unit}})})):ui.kind==='case'?[{q:{id:'case',label:'',valueType:'text',input:{kind:'text'}},cmd:(v:any)=>({kind:'case-submit',value:{evidenceIds:typeof v==='boolean'?(v?ui.evidenceOptions.map((o:any)=>o.id):[]):ui.evidenceOptions.slice(0,1).map((o:any)=>o.id),decision:String(v),justification:String(v),reflection:String(v)}})}]:[];
    // case evidence ids come from checkboxes (only allowed ids reach the engine; an unknown id is SYSTEM_INVARIANT_FAILED
    // by design): the probe varies what the learner can TYPE and the selection size (none / one / all)
    if(ui.kind==='trainer') for(const v of c.acceptedAnswers??[]) if(String(v).length>2&&ui.prompt.includes(String(v))) promptLeaks.push(a.id);
    for(const {q,cmd} of questions){
      const p=await probe(model,cmd); row.crashes+=p.crashes; row.crashErrors.push(...p.errors); row.probeCategories=[...new Set([...row.probeCategories,...p.categories])].sort();
      if(ui.kind==='simulation'||ui.kind==='trainer'){
        const configured=ui.kind==='trainer'?(c.acceptedAnswers?.[0]??c.expectedFormula):(c.targetState?.[q.id]??c.expected??c.targetMedium);
        const expected=configured??await engineExpected(model,cmd('\u0000probe'));
        const domain=answerDomainOf(model,q.id);
        const chosen=q.input.kind==='choice';
        // a generic trainer's acceptedAnswers are authored LEARNER answers (Uzbek words with synonyms: "asos"/"ishqor"),
        // not internal codes — they are free text by design
        const shape=ui.kind==='trainer'&&Array.isArray(c.acceptedAnswers)?'AUTHORED_ANSWER':answerShape(expected);
        answers.push({activityId:a.id,learningUnitId:lu,field:q.id,label:q.label,input:q.input.kind,
          ...(chosen?{domain:domain?.domain??'boolean',domainSource:domain?.source??'boolean',options:q.input.choices.length,optionsContainAnswer:q.input.choices.some((x:any)=>x.value===String(expected)),category:domain?(domain.domain==='organic-product'&&/-repeat-unit$/.test(String(expected))?'POLYMER_STRUCTURE':categoryOfDomain(domain.domain)):'ENUM'}
            :{answerShape:shape,...(shape==='INTERNAL_TOKEN'?{category:categoryOfField(q.id,String(expected)),status:'OPTION_SET_MISSING'}:{})}),
          internalTokenTyped:!chosen&&shape==='INTERNAL_TOKEN',closedDomainAsText:!chosen&&Boolean(domain&&domain.values.length>=2)});
      }
    }
    row.crashErrors=[...new Set(row.crashErrors)];
    const labelIds:Array<[string,string,string]>=ui.kind==='experiment'?ui.controls.map((x:any)=>['action',x.action,x.label]):ui.kind==='simulation'?ui.controls.map((x:any)=>['field',x.field,x.label]):ui.kind==='calculation'?ui.steps.map((x:any)=>['step',x.id,x.label]):ui.kind==='case'?ui.evidenceOptions.map((x:any)=>['evidence',x.id,x.label]):[];
    for(const [ns,id,label] of labelIds){
      const derived=[id,id.replaceAll('-',' '),id.replace(/([A-Z])/g,' $1').trim()];
      const missing=ui.localizationMissing.includes(`${ns}.${id}`);
      labels.push({rawId:id,shownAs:ns,activityId:a.id,learningUnitId:lu,label,source:missing?'fallback':model.localization?.interaction?.labels?.[`${ns}.${id}`]===label?'locale':'content',category:labelCategory(ns,id),rawIdLearnerFacing:derived.includes(label),...(missing?{gap:'LOCALIZATION_MISSING'}:{})});
    }
    for(const x of answers.filter(y=>y.activityId===a.id&&y.input==='choice')) for(const ch of ui.kind==='simulation'?ui.controls.find((k:any)=>k.field===x.field).question.input.choices:ui.question.input.choices) labels.push({rawId:ch.value,shownAs:'answer',activityId:a.id,learningUnitId:lu,label:ch.label,source:ui.localizationMissing.includes(ch.labelKey)?'fallback':'locale',category:'option token',rawIdLearnerFacing:ch.label===ch.value});
    activities.push(row);
  }
  const uniqA=(xs:any[])=>[...new Set(xs)];
  const crashActs=activities.filter(x=>x.crashes>0).map(x=>x.activityId);
  const rawActs=uniqA(labels.filter(x=>x.rawIdLearnerFacing).map(x=>x.activityId));
  const tokenActs=uniqA(answers.filter(x=>x.internalTokenTyped).map(x=>x.activityId));
  const closedText=answers.filter(x=>x.closedDomainAsText);
  const chosen=answers.filter(x=>x.input==='choice');
  const gaps=uniqA(activities.flatMap(x=>x.localizationMissing)).sort();
  const answerAudit={schema:'kimyolab.learner-answer-input-audit.v1',semantics:'Every answer field of a launchable legacy-form activity. input=choice: a closed domain from the domain/config (domainSource) rendered as labelled options. input=text|number|formula: open answer. OPTION_SET_MISSING: the engine expects an internal token but the repository holds no option set (only the target) — inventing distractors is new content, so the field stays text and is listed here.',
    counts:{fields:answers.length,choice:chosen.length,text:answers.filter(x=>x.input!=='choice').length,internalTokenTyped:answers.filter(x=>x.internalTokenTyped).length,closedDomainAsText:closedText.length,byCategory:Object.fromEntries(Object.entries(answers.filter(x=>x.category).reduce((m:any,x:any)=>(m[x.category]=(m[x.category]??0)+1,m),{})).sort())},
    fields:answers};
  const labelAudit={schema:'kimyolab.learner-label-audit.v1',semantics:'Every learner-facing label that is keyed by an id. source: locale (learner-interaction catalog), content (authored label), fallback (numbered generic label; gap LOCALIZATION_MISSING). rawIdLearnerFacing: the label is the id or its mechanical humanization (must be 0).',
    counts:{labels:labels.length,rawIdLearnerFacing:labels.filter(x=>x.rawIdLearnerFacing).length,localizationMissing:labels.filter(x=>x.gap).length,bySource:Object.fromEntries(Object.entries(labels.reduce((m:any,x:any)=>(m[x.source]=(m[x.source]??0)+1,m),{})).sort())},
    labels};
  const reliability={schema:'kimyolab.interaction-reliability.v1',semantics:'P2.1 learner-interaction reliability of the real legacy browser path; renderer-owned activities (atom, hydrolysis, ionic) have bounded controls and their own suites. Every learner input field is probed with PROBE_INPUTS in a fresh session: an exception is a crash (SYSTEM_INVARIANT_FAILED reached from learner input).',
    baseline:P20_BASELINE,
    launchableActivities:launchable,legacyFormActivities:activities.length,rendererOwnedActivities:rendererOwned,
    probeInputs:PROBE_INPUTS.length,
    crashOnLearnerInput:{before:P20_BASELINE.crashOnLearnerInput,after:crashActs.length,activities:crashActs},
    rawIdLearnerFacing:{before:P20_BASELINE.rawIdLabelActivities,after:rawActs.length,activities:rawActs},
    internalTokenTextInput:{before:P20_BASELINE.untranslatedTokenActivities,after:tokenActs.length,activities:tokenActs,reason:'OPTION_SET_MISSING'},
    closedDomainTextInputs:{after:closedText.length,fields:closedText.map(x=>`${x.activityId}#${x.field}`)},
    choiceConverted:{fields:chosen.length,activities:uniqA(chosen.map(x=>x.activityId)).length,byDomain:Object.fromEntries(Object.entries(chosen.reduce((m:any,x:any)=>(m[x.domain]=(m[x.domain]??0)+1,m),{})).sort())},
    localizationMissing:{keys:gaps.length,list:gaps},
    uiStrings:(()=>{ const h=hardcodedUzbek(root); return {sharedKeys:REQUIRED_UI_KEYS.length,catalog:'content-src/locales/uz-latn/learner-interaction.json',hardcodedUzbekLiterals:{before:P20_BASELINE.hardcodedUzbekLiterals,after:h.literals,filesBefore:P20_BASELINE.hardcodedUzbekFiles,filesAfter:h.files,migrated:P20_BASELINE.migratedFiles,remainingByFile:h.byFile},scope:'P2.1 migrates the shared legacy practice interaction strings; hub/home/labs/renderer strings stay (full ru/uz-Cyrl translation is out of scope)'}; })(),
    outcomeCategoriesSeen:uniqA(activities.flatMap(x=>x.probeCategories)).sort(),
    knownLimitations:[
      {id:'OPTION_SET_MISSING',count:tokenActs.length,detail:'generic simulations / bounded-choice hold only the target token; an authored option set is needed before they can become choices (P2.2 authoring)'},
      {id:'CONTENT_PROMPT_SHOWS_ANSWER_FORMAT',activities:[...new Set(promptLeaks)].sort(),detail:'authored trainer prompts give the answer format using the answer itself (e.g. "2,1,2 ko‘rinishida"); a content fix needs an author and review'},
      {id:'REFERENCE_CONFIG_IN_PAGE_MODEL',detail:'the client-side practice engine receives referenceConfig in the page model (pre-existing architecture); the UI model and the DOM never contain an expected answer'},
    ],
  };
  return {answerAudit,labelAudit,reliability};
}

export async function writeInteractionReports(root:string){
  const {answerAudit,labelAudit,reliability}=await buildInteractionReports(root);
  const w=(rel:string,v:unknown)=>fs.writeFileSync(path.join(root,rel),JSON.stringify(v,null,2)+'\n');
  w(INTERACTION_REPORTS[0],answerAudit); w(INTERACTION_REPORTS[1],labelAudit); w(INTERACTION_REPORTS[2],reliability);
  return reliability;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=await writeInteractionReports(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
  console.log(JSON.stringify({launchable:r.launchableActivities,legacyForm:r.legacyFormActivities,crash:r.crashOnLearnerInput,rawId:{before:r.rawIdLearnerFacing.before,after:r.rawIdLearnerFacing.after},token:{before:r.internalTokenTextInput.before,after:r.internalTokenTextInput.after},closedDomainText:r.closedDomainTextInputs.after,choice:r.choiceConverted,locMissing:r.localizationMissing.keys}));
}
