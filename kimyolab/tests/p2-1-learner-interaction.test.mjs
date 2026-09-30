// P2.1 — learner interaction reliability & usability. Learner input never crashes a session; closed-domain answers
// are chosen from human-readable labels (display label → canonical token mapped in presentation); no raw internal id
// is learner-facing; the answer key never reaches the UI model or the DOM. Chemistry truth is not changed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {diskFetch} from '../scripts/pilot-status.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const client=()=>new ContentClient({fetchImpl:diskFetch(root),baseUrl:'/content'});
const NOW={now:()=>'2026-01-01T00:00:00.000Z'};
const MN='practice.simulation.9.23.planned';

// ------------------------------------------------------------------ 9.23 crash regression (FAILED on the P2.0 code:
// the session threw MANGANESE_MEDIUM_NOT_MODELED for any medium the model does not know)

for(const value of ['kislotali','ACIDIC','','   ','x'.repeat(500),'<img src=x onerror=alert(1)>','кислотная']){
  test(`9.23 regression: learner input ${JSON.stringify(value.slice(0,24))} gives feedback, never a crash`,async()=>{
    const model=await client().loadPractice(MN);
    const s=new ReferencePracticeSession(model,NOW);
    const r=await s.apply({kind:'simulation-action',action:{field:'medium',value}});
    assert.equal(r.evidence.length,0,'invalid input is not evidence');
    if(value.trim()) assert.equal(r.outcomes.at(-1).code,'LEARNER_INPUT_INVALID');
    // the session is still usable afterwards: the correct answer completes it
    const ok=await s.apply({kind:'simulation-action',action:{field:'medium',value:'acidic'}});
    assert.ok(ok.evidence.some(e=>e.achieved===true&&e.score===1));
  });
}

test('9.23: a wrong but modelled medium is LEARNER_INCORRECT (score 0), not invalid',async()=>{
  const model=await client().loadPractice(MN);
  const r=await new ReferencePracticeSession(model,NOW).apply({kind:'simulation-action',action:{field:'medium',value:'basic'}});
  assert.equal(r.evidence[0].score,0); assert.equal(r.evidence[0].achieved,false);
});

// ------------------------------------------------------------------ taxonomy (existing outcome shapes, no parallel taxonomy)

import fs from 'node:fs';
import path from 'node:path';
import {classifyLearnerOutcome,LEARNER_INCORRECT,LEARNER_INPUT_INVALID,MODEL_NOT_SUPPORTED} from '../src/runtime/shared/learner-input.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {answerValue,createLabeler,buildChoices} from '../src/features/practice/form-question.ts';
import {answerDomainOf} from '../src/features/practice/answer-domain.ts';
import {parseInteractionCatalog,createLocalizer,REQUIRED_UI_KEYS} from '../src/features/localization/element-names.ts';
import {buildInteractionReports,P20_BASELINE} from '../scripts/learner-interaction.ts';

test('taxonomy: learner outcomes map onto the existing engine result shapes',()=>{
  assert.equal(classifyLearnerOutcome({outcomes:[{status:'invalid',code:'LEARNER_INPUT_INVALID'}],evidence:[]}),LEARNER_INPUT_INVALID);
  assert.equal(classifyLearnerOutcome({outcomes:[{status:'invalid',code:'ELECTROLYSIS_NOT_MODELED'}]}),MODEL_NOT_SUPPORTED);
  assert.equal(classifyLearnerOutcome({evidence:[{score:0,achieved:false}]}),LEARNER_INCORRECT);
  assert.equal(classifyLearnerOutcome({evidence:[{score:1,achieved:true}]}),'LEARNER_CORRECT');
  assert.equal(classifyLearnerOutcome({evidence:[]}),'NEUTRAL');
});

test('SYSTEM_INVARIANT_FAILED still throws: broken content is not learner input',async()=>{
  const model=await client().loadPractice(MN);
  const broken={...model,chemistry:{...model.chemistry,manganeseRedox:{records:[{medium:'acidic'}]}}};
  assert.throws(()=>new ReferencePracticeSession(broken,NOW),/MANGANESE_RECORD_INVALID/);
});

// ------------------------------------------------------------------ closed domains become choices

const CHOICES={
  'practice.simulation.9.23.planned':['medium','manganese-medium',3],
  'practice.simulation.11.16.planned':['effect','kinetics-effect',3],
  'practice.simulation.11.18.planned':['shift','equilibrium-shift',3],
  'practice.simulation.11.03.planned':['conserved','boolean',2],
  'practice.simulation.11.17.planned':['equilibrium','boolean',2],
  'practice.simulation.10.10.planned':['product','organic-product',12],
  'practice.simulation.10.13.planned':['product','organic-product',12],
  'practice.simulation.10.14.planned':['product','organic-product',12],
  'practice.simulation.10.15.planned':['aromatic','boolean',2],
  'practice.simulation.10.20.planned':['class','organic-class',15],
  'practice.trainer.10.06.planned':['answer','organic-reaction-type',7],
  'practice.trainer.10.07.planned':['answer','organic-name',19],
  'practice.trainer.10.09.planned':['answer','organic-name',19],
};
const questionOf=(ui,field)=>ui.kind==='trainer'?ui.question:ui.controls.find(c=>c.field===field).question;

test('closed-domain fields are choices with human-readable labels from the catalog; the option set comes from the domain',async()=>{
  for(const [id,[field,domain,n]] of Object.entries(CHOICES)){
    const model=await client().loadPractice(id); const ui=buildPracticePageUi(model); const q=questionOf(ui,field);
    assert.equal(q.input.kind,'choice',id); assert.equal(q.input.choices.length,n,id);
    assert.equal(answerDomainOf(model,field)?.domain??'boolean',domain,id);
    for(const ch of q.input.choices){ assert.ok(ch.label.trim(),id); assert.notEqual(ch.label,ch.value,`${id}: "${ch.value}" is shown raw`); assert.deepEqual(Object.keys(ch).sort(),['label','labelKey','value']); }
    assert.deepEqual(ui.localizationMissing,[],id);
  }
});
function buildPracticePageUi(model){ return buildPracticeUiModel(model); }

test('choice order never reveals the answer: same domain → same order, whichever option is correct',async()=>{
  const orders=[];
  for(const id of ['practice.simulation.10.10.planned','practice.simulation.10.13.planned','practice.simulation.10.14.planned']){
    const ui=buildPracticeUiModel(await client().loadPractice(id)); orders.push(JSON.stringify(ui.controls[0].question.input.choices));
  }
  assert.equal(new Set(orders).size,1,'three activities with different correct products render identical options');
  const d={domain:'x',values:['b-correct','a-wrong','c-wrong'],valueType:'text',source:'t'};
  const order=(values)=>buildChoices({...d,values},createLabeler(()=>null)).map(c=>c.value);
  assert.deepEqual(order(['c-wrong','b-correct','a-wrong']),order(d.values),'deterministic: the input (e.g. correct-first) order is irrelevant');
});

test('the DOM value of a choice is its index; unknown/empty input is refused before the engine',()=>{
  const q={id:'medium',label:'Muhit',valueType:'text',input:{kind:'choice',choices:[{value:'acidic',label:'Kislotali muhit'},{value:'basic',label:'Ishqoriy muhit'}]}};
  assert.equal(answerValue(q,'0'),'acidic'); assert.equal(answerValue(q,'1'),'basic');
  for(const bad of ['','2','-1','acidic','1.0',' 0']) assert.equal(answerValue(q,bad),null,bad);
  const b={id:'x',label:'X',valueType:'boolean',input:{kind:'choice',choices:[{value:'true',label:'Ha'},{value:'false',label:'Yo‘q'}]}};
  assert.equal(answerValue(b,'0'),true); assert.equal(answerValue(b,'1'),false);
  assert.equal(answerValue({id:'a',label:'A',valueType:'text',input:{kind:'text'}},'   '),null);
  assert.equal(answerValue({id:'a',label:'A',valueType:'number',input:{kind:'number'}},''),null);
});

// ------------------------------------------------------------------ evidence parity: choice path ≡ canonical command

const strip=(r)=>JSON.parse(JSON.stringify({evidence:(r.evidence??[]).map(({id,score,achieved,correct,type,targetId})=>({id,score,achieved,correct,type,targetId})),final:r.finalState?.status??null,outcome:r.outcomes?.at?.(-1)?.status??null}));
// canonical tokens come from content (config / chemistry data), never from the UI
const PARITY=[
  ['simple enum','practice.simulation.11.16.planned','effect',null],
  ['polymer token','practice.simulation.10.13.planned','product','polybutadiene-repeat-unit'],
  ['species choice','practice.simulation.10.10.planned','product','chloromethane'],
  ['medium choice','practice.simulation.9.23.planned','medium','acidic'],
];
for(const [name,id,field,token] of PARITY){
  test(`evidence parity (${name}): the chosen label gives the same evidence, score and completion as the canonical token`,async()=>{
    const model=await client().loadPractice(id); const q=questionOf(buildPracticeUiModel(model),field);
    let canonical=token;
    if(!canonical){ const probe=await new ReferencePracticeSession(model,NOW).apply({kind:'simulation-action',action:{field,value:'?'}}); canonical=JSON.parse(probe.serializedState).expected; }
    for(const value of q.input.choices.map(c=>c.value)){
      const index=q.input.choices.findIndex(c=>c.value===value);
      const direct=await new ReferencePracticeSession(model,NOW).apply({kind:'simulation-action',action:{field,value}});
      const viaForm=await new ReferencePracticeSession(model,NOW).apply({kind:'simulation-action',action:{field,value:answerValue(q,String(index))}});
      assert.deepEqual(strip(viaForm),strip(direct),`${id} ${value}`);
      assert.equal(direct.evidence[0].score,value===canonical?1:0,`${id} ${value}`);
    }
  });
}

// ------------------------------------------------------------------ localization: catalog, fallback, never a raw id

const catalogFile=path.join(root,'content-src/locales/uz-latn/learner-interaction.json');
test('learner-interaction catalog: valid, pending review, has every shared UI string; bad catalogs are refused',()=>{
  const raw=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
  const cat=parseInteractionCatalog(raw); assert.equal(raw.reviewStatus,'pending','display translations are not approved by the agent');
  for(const k of REQUIRED_UI_KEYS) assert.ok(cat.labels[k],k);
  assert.throws(()=>parseInteractionCatalog({...raw,labels:{...raw.labels,'concept.c123':'x'}}),/INTERACTION_TEXT_INVALID:key/);
  const {['ui.submit']:_,...missing}=raw.labels; assert.throws(()=>parseInteractionCatalog({...raw,labels:missing}),/missing:ui.submit/);
  assert.throws(()=>parseInteractionCatalog({...raw,labels:{...raw.labels,'ui.retry':'  '}}),/INTERACTION_TEXT_INVALID:text/);
  // one lookup for every key family — element/species names keep working through the same localizer
  const loc=createLocalizer({interaction:cat}); assert.equal(loc('answer.manganese-medium.acidic'),'Kislotali muhit'); assert.equal(loc('species.x.name'),null);
});

test('missing localization never shows a raw id and never breaks chemistry execution',async()=>{
  const model=await client().loadPractice(MN); const bare={...model,localization:undefined};
  const ui=buildPracticeUiModel(bare); const q=ui.controls[0].question;
  assert.ok(ui.localizationMissing.includes('field.medium')&&ui.localizationMissing.includes('answer.manganese-medium.acidic'));
  assert.notEqual(q.label,'medium'); for(const c of q.input.choices){ assert.notEqual(c.label,c.value); assert.doesNotMatch(c.label,/acidic|basic|neutral/); }
  const i=q.input.choices.findIndex(c=>c.value==='acidic');
  const r=await new ReferencePracticeSession(bare,NOW).apply({kind:'simulation-action',action:{field:'medium',value:answerValue(q,String(i))}});
  assert.equal(r.evidence[0].score,1,'chemistry runs without any catalog');
});

// ------------------------------------------------------------------ leakage: no answer key in the UI model

const LEAK_KEYS=/"(correctAnswer|expectedToken|answerKey|expected|expectedFormula|acceptedAnswers|targetState|targetMedium|correct|isCorrect)"\s*:/;
test('leakage: no launchable legacy UI model carries an answer key, and a typed field never carries its answer',async()=>{
  const acts=JSON.parse(fs.readFileSync(path.join(root,'content-src/practice-activities.json'),'utf8'));
  const c=client(); let checked=0; const promptLeaks=[];
  for(const a of acts){
    let model; try{ model=await c.loadPractice(a.id); }catch{ continue; } if(model.executionPlan.rendererRequirement) continue;
    const ui=buildPracticeUiModel(model); const json=JSON.stringify(ui); checked++;
    assert.doesNotMatch(json,LEAK_KEYS,a.id);
    const cfg=model.referenceConfig; const typedFields=ui.kind==='simulation'?ui.controls.filter(x=>x.question.input.kind!=='choice').map(x=>x.field):[];
    for(const f of typedFields){ const v=cfg.targetState?.[f]??cfg.expected; if(typeof v==='string'&&v.length>2) assert.ok(!JSON.stringify(ui.controls).includes(JSON.stringify(v)),`${a.id}#${f} leaks "${v}"`); }
    if(ui.kind==='trainer') for(const v of cfg.acceptedAnswers??[]) if(ui.prompt.includes(v)&&v.length>2) promptLeaks.push(a.id);
  }
  assert.ok(checked>=140,`${checked} UI models checked`);
  // KNOWN LIMITATION (authored content, not changed by P2.1): these prompts show the answer FORMAT with the answer itself
  assert.deepEqual([...new Set(promptLeaks)].sort(),['practice.trainer.7.15.planned','practice.trainer.8.08.planned']);
});

// ------------------------------------------------------------------ reliability report (computed, not asserted by hand)

test('interaction reliability: no crash on learner input, no raw id, no closed domain as text; remaining tokens are listed',async()=>{
  const {reliability:r,answerAudit,labelAudit}=await buildInteractionReports(root);
  assert.equal(r.baseline,P20_BASELINE);
  assert.equal(r.crashOnLearnerInput.after,0); assert.equal(r.rawIdLearnerFacing.after,0); assert.equal(r.closedDomainTextInputs.after,0);
  assert.equal(r.localizationMissing.keys,0); assert.ok(r.choiceConverted.activities>=13);
  assert.ok(r.internalTokenTextInput.after<P20_BASELINE.untranslatedTokenActivities);
  for(const f of answerAudit.fields.filter(x=>x.internalTokenTyped)) assert.equal(f.status,'OPTION_SET_MISSING',f.activityId);
  for(const f of answerAudit.fields.filter(x=>x.input==='choice')) assert.equal(f.optionsContainAnswer,true,f.activityId);
  assert.equal(labelAudit.counts.rawIdLearnerFacing,0);
  const onDisk=JSON.parse(fs.readFileSync(path.join(root,'reports/interaction-reliability.json'),'utf8'));
  assert.deepEqual(onDisk,JSON.parse(JSON.stringify(r)),'committed report is current (run npm run learner:interaction)');
});

test('progress: UX work does not inflate depth — MODEL_BASED stays 4, STATIC_CHECK stays STATIC_CHECK',()=>{
  const b=JSON.parse(fs.readFileSync(path.join(root,'reports/learning-depth-baseline.json'),'utf8'));
  const n=(d)=>b.activities.filter(a=>a.depth===d).length;
  assert.equal(n('MODEL_BASED'),4); assert.equal(n('STATIC_CHECK'),116); assert.equal(n('GUIDED'),25);
  for(const id of Object.keys(CHOICES)) assert.notEqual(b.activities.find(a=>a.activityId===id).depth,'MODEL_BASED',`${id}: a choice UI is not a model`);
  const p=JSON.parse(fs.readFileSync(path.join(root,'reports/project-progress.json'),'utf8'));
  assert.equal(p.foundationProgress.percent,100,'9.23 was the only failing foundation check');
});

test('shared interaction strings live in the catalog: the legacy practice renderer has no Uzbek literal',()=>{
  for(const f of ['src/features/practice/render.ts','src/features/practice/ui-model.ts','src/features/practice/form-question.ts']){
    const s=fs.readFileSync(path.join(root,f),'utf8'); assert.doesNotMatch(s,/['"`][^'"`\n]*[‘’ʻ][^'"`\n]*['"`]/,`${f} has an Uzbek literal`);
  }
});
