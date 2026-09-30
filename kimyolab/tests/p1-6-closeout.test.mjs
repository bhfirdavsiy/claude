// P1.6 closeout — semantic audit before merge: the explicit ReactionMatcher condition policy (caller regression
// matrix), condition semantics (specified / unspecified / conflicting), the three match classes, the NaCl + H2SO4
// regression as a KB-wide property, the net-ionic comparator corpus, expected-answer exposure, evidence identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ReactionMatcher,requirementsMet,classifyMatch,NO_REACTION_TYPE} from '../src/domain/chemistry/reaction-matcher.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {SpeciesRegistry} from '../src/domain/chemistry/species-registry.ts';
import {compareNetIonic} from '../src/domain/chemistry/ionic-equation.ts';
import {evaluateIonicMixing} from '../src/domain/chemistry/ionic-mixing.ts';
import {toIonicPrecipitationRendererModel} from '../src/renderers/ionic-precipitation/renderer-model.ts';
import {ionicIntent} from '../src/renderers/ionic-precipitation/renderer.ts';
import {createDefaultRendererRegistry} from '../src/renderers/index.ts';
import {renderPracticePage} from '../src/features/practice/host.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {computeConceptMastery} from '../src/domain/mastery/mastery.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {memoryPackFetch} from './helpers/memory-pack.mjs';
import {installMiniDom} from './helpers/mini-dom.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const REACTIONS=read('content-src/chemistry/reactions.json'), RULES=read('content-src/chemistry/solubility.json'), SPECIES=read('content-src/chemistry/species.json');
const matcher=ReactionMatcher.from(REACTIONS), ionic=IonicEngine.from({reactions:REACTIONS,rules:RULES});
const ID='practice.experiment.8.1';
const CONFIG=read('content-src/activity-configs/reference-slices.json')[ID];
const pick=(slot,speciesId)=>({type:'selectReagent',payload:{slot,speciesId}}), mix={type:'mix'}, eq=(equation)=>({type:'writeEquation',payload:{equation}});
const pair=(a,b)=>[pick('A',a),pick('B',b),mix];
const client=()=>new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
const settle=async()=>{ for(let i=0;i<30;i++) await new Promise(r=>setTimeout(r,0)); };
const hasRequirement=(c)=>Boolean((c?.tags??[]).length||c?.lightRequired!==undefined||c?.electricalCurrent!==undefined||c?.medium||c?.solvent||(c?.catalystIds??[]).length||c?.temperatureRange||c?.pressureRange||c?.concentrationRules);

test('condition policy is explicit: no caller gets enforcement (or its absence) by an implicit default',()=>{
  assert.throws(()=>matcher.match({reactants:['AgNO3','NaCl']}),/REACTION_MATCH_POLICY_REQUIRED/);
  assert.throws(()=>matcher.match({reactants:['AgNO3','NaCl'],conditionPolicy:'maybe'}),/REACTION_MATCH_POLICY_REQUIRED/);
  // caller regression matrix — every production caller states its policy
  const callers={
    'src/runtime/reference-slices/experiment-adapter.ts':"conditionPolicy:'filter-by-query'",     // legacy scenario path
    'src/domain/chemistry/ionic-mixing.ts':"conditionPolicy:'require-record-conditions'",           // mixing two solutions
  };
  for(const [file,policy] of Object.entries(callers)){
    const src=fs.readFileSync(path.join(root,file),'utf8');
    const calls=src.match(/\.match\(\{reactants/g)??[];
    assert.ok(calls.length>0,file);
    assert.equal((src.match(new RegExp(policy.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))??[]).length,calls.length,`${file}: every call states ${policy}`);
  }
  const all=fs.readdirSync(path.join(root,'src'),{recursive:true}).map(String).filter(f=>f.endsWith('.ts'));
  const using=all.filter(f=>/matcher\.match\(\{|reactionMatcher\.match\(\{/.test(fs.readFileSync(path.join(root,'src',f),'utf8'))).map(f=>`src/${f}`.split(path.sep).join('/'));
  assert.deepEqual(using.sort(),Object.keys(callers).sort(),'no unlisted caller');
  // legacy behaviour preserved under 'filter-by-query' (documented), enforced under the other policy
  assert.equal(matcher.match({reactants:[{formula:'NaCl',phase:'aq'},{formula:'H2SO4',phase:'aq'}],conditionPolicy:'filter-by-query'}).modeled,true);
  assert.deepEqual(matcher.match({reactants:[{formula:'NaCl',phase:'aq'},{formula:'H2SO4',phase:'aq'}],conditionPolicy:'require-record-conditions'}),{modeled:false,code:'REACTION_CONDITIONS_NOT_MET'});
});

test('condition semantics: unspecified record = no requirement; specified but unknown in the actual context = NOT met; conflicting = NOT met',()=>{
  const cases=[
    [{},{} ,true,'record states nothing'],
    [{tags:[]},{},true,'empty tag list'],
    [{tags:['heating']},{},false,'required heating, actual unspecified → not assumed'],
    [{tags:['heating']},{tags:['heating']},true,'required and present'],
    [{tags:['concentrated acid','gentle heating']},{tags:['gentle heating']},false,'every required tag must be present'],
    [{electricalCurrent:true},{},false,'current required, unspecified'],
    [{electricalCurrent:true},{electricalCurrent:true},true,''],
    [{electricalCurrent:false},{electricalCurrent:true},false,'conflicting boolean'],
    [{lightRequired:true},{lightRequired:false},false,'conflicting'],
    [{medium:'acidic'},{},false,'medium unspecified'],
    [{medium:'acidic'},{medium:'basic'},false,'conflicting medium'],
    [{solvent:'water'},{solvent:'water'},true,''],
    [{catalystIds:['species.mno2']},{},false,'catalyst missing'],
    [{temperatureRange:{min:80,unit:'C'}},{},false,'no range arithmetic is guessed'],
  ];
  for(const [record,actual,expected,why] of cases) assert.equal(requirementsMet(record,actual),expected,`${JSON.stringify(record)} vs ${JSON.stringify(actual)} ${why}`);
});

test('regression (KB-wide property): a room-temperature mix of two solutions never matches a record that needs conditions',()=>{
  const conditioned=REACTIONS.filter(r=>hasRequirement(r.conditions));
  assert.ok(conditioned.some(r=>r.id==='rxn.nacl-h2so4'),'the P1.6 bug record is covered');
  for(const r of conditioned){
    const q=r.reactants.map(x=>({formula:x.formula,phase:'aq'}));
    const m=matcher.match({reactants:q,conditionPolicy:'require-record-conditions'});
    assert.ok(!m.modeled||m.reaction.id!==r.id,r.id);
    // with exactly its own conditions it does apply (the policy is not a blanket refusal)
    const own=matcher.match({reactants:r.reactants.map(x=>({formula:x.formula,...(x.phase?{phase:x.phase}:{})})),conditions:r.conditions,conditionPolicy:'require-record-conditions'});
    assert.ok(own.modeled&&own.reaction.id===r.id||own.code==='REACTION_CONDITION_REQUIRED',`${r.id} under its own conditions`);
  }
  // the ionic mix of NaCl + H2SO4 is NOT_MODELED (not "gas", and not "no reaction")
  const st=evaluateIonicMixing({species:SpeciesRegistry.from(SPECIES),matcher,ionic},{shelf:CONFIG.reagentShelf,targetReactionId:CONFIG.reactionId,actions:pair('species.nacl','species.h2so4')});
  assert.deepEqual([st.current.outcome,st.current.coverageCode],['not-modeled','REACTION_CONDITIONS_NOT_MET']);
});

test('three classes: MODELED_REACTION / MODELED_NO_REACTION / NOT_MODELED — in domain, evidence and renderer',()=>{
  const fixture={id:'rxn.fixture.no-reaction',reactants:[{formula:'NaCl'},{formula:'NaNO3'}],products:[],conditions:{tags:[]},direction:'forward',reactionType:NO_REACTION_TYPE,molecularEquation:'NaCl + NaNO3 → (no reaction)',observations:[{type:'no-visible-change'}],safety:[],curriculumRefs:[],sourceRefs:[{id:'src.fixture',type:'internal',title:'synthetic fixture (not canonical content)'}],version:'1.0.0'};
  const m2=ReactionMatcher.from([...REACTIONS,fixture]);
  const q=(a,b)=>m2.match({reactants:[{formula:a,phase:'aq'},{formula:b,phase:'aq'}],conditionPolicy:'require-record-conditions'});
  assert.equal(classifyMatch(q('AgNO3','NaCl')),'MODELED_REACTION');
  assert.equal(classifyMatch(q('NaCl','NaNO3')),'MODELED_NO_REACTION');
  assert.equal(classifyMatch(q('AgNO3','NaNO3')),'NOT_MODELED');
  assert.equal(classifyMatch(q('NaCl','H2SO4')),'NOT_MODELED');
  assert.equal(REACTIONS.filter(r=>r.reactionType===NO_REACTION_TYPE).length,0,'KNOWN CONTENT GAP: the production KB has no explicit no-reaction record');
  const d={species:SpeciesRegistry.from(SPECIES),matcher:m2,ionic:IonicEngine.from({reactions:[...REACTIONS,fixture],rules:RULES})};
  const st=(actions)=>evaluateIonicMixing(d,{shelf:CONFIG.reagentShelf,targetReactionId:CONFIG.reactionId,actions});
  const states=[['species.agno3','species.nacl'],['species.nacl','species.nano3'],['species.agno3','species.nano3']].map(([a,b])=>toIonicPrecipitationRendererModel({finalState:{ionic:st(pair(a,b))},evidence:[]}));
  assert.deepEqual(states.map(s=>s.reactionState),['modeled-reaction','modeled-no-reaction','not-modeled']);
  assert.notEqual(states[1].observation.text,states[2].observation.text);
  assert.doesNotMatch(states[2].observation.text,/reaksiya bormaydi \(/,'NOT_MODELED is never rendered as "no reaction"');
});

test('net-ionic comparator corpus: no false positives, no false negatives',()=>{
  const {cases}=read('tests/fixtures/net-ionic-corpus.json');
  const dims=new Set(cases.map(c=>c.dimension.split(' (')[0]));
  for(const d of ['term ordering','coefficient normalization','charge syntax','Unicode','phase marks','spectator ions','arrow variants','whitespace','ambiguous charge notation']) assert.ok([...dims].some(x=>x.includes(d)),`corpus covers ${d}`);
  for(const c of cases){
    const r=compareNetIonic(c.input,ionic.netIonicEquation(c.reaction).equation);
    assert.equal(r.syntax==='error'?`syntax:${r.reason}`:r.correct,c.verdict,`${c.dimension}: ${JSON.stringify(c.input)}`);
  }
});

test('expected answer: never in the renderer model or the DOM — before or after a submission',async()=>{
  const dom=installMiniDom();
  try{
    const page=await client().loadPractice(ID);
    const s=new ReferencePracticeSession(page);
    renderPracticePage(dom.root,page,{apply:c=>s.apply(c),current:()=>s.result()},createDefaultRendererRegistry());
    await settle();
    const expected=ionic.netIonicEquation(CONFIG.reactionId).equation;
    const leaks=()=>{ const card=dom.root.querySelector('[data-renderer]'); return [dom.root.textContent,card.dataset.model].some(t=>t.includes(expected)||t.includes('AgCl(s)')); };
    for(const a of pair('species.agno3','species.nacl')) await s.apply(ionicIntent(a,'experiment'));
    const choose=async(slot,id)=>{ const el=dom.root.querySelector(`[data-slot="${slot}"]`); el.value=id; el.dispatch('change'); await settle(); };
    await choose('A','species.agno3'); await choose('B','species.nacl');
    dom.root.querySelector('[data-action="mix"]').click(); await settle();
    assert.equal(leaks(),false,'before submission');
    const input=dom.root.querySelector('[data-field="equation-input"]');
    input.value='Ag+ + NO3- -> AgNO3'; dom.root.querySelector('form').dispatch('submit'); await settle();
    assert.equal(dom.root.querySelector('.kl-ionic__result').dataset.result,'incorrect');
    assert.equal(leaks(),false,'after a wrong submission the learner sees feedback, not the canonical equation');
  }finally{ dom.restore(); }
});

test('evidence identity: A+B = B+A, re-mix adds nothing, an unchanged resubmission is not a revision, retry = new attempt',async()=>{
  const d={species:SpeciesRegistry.from(SPECIES),matcher,ionic};
  const st=(actions)=>evaluateIonicMixing(d,{shelf:CONFIG.reagentShelf,targetReactionId:CONFIG.reactionId,actions});
  assert.equal(st([...pair('species.agno3','species.nacl'),...pair('species.nacl','species.agno3'),mix]).mixes.length,1);
  const unchanged=st([...pair('species.agno3','species.nacl'),eq('Ag+ + NO3- -> AgNO3'),eq('  Ag+ + NO3-  ->  AgNO3 '),eq('NO3- + Ag+ -> AgNO3')]);
  assert.deepEqual([unchanged.equations.length,unchanged.rejected],[1,'EQUATION_UNCHANGED'],'an equivalent resubmission is not new evidence');
  const revised=st([...pair('species.agno3','species.nacl'),eq('Ag+ + NO3- -> AgNO3'),eq('Ag+ + Cl- -> AgCl(aq)'),eq('Ag+ + Cl- -> AgCl')]);
  assert.deepEqual(revised.equations.map(e=>e.correct),[false,false,true],'real revisions are kept');
  // retry: a new attempt; engine ids repeat but persisted evidence is bound to each attempt
  const page=await client().loadPractice(ID);
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'ionic-id',{liveness:null});
  const store=new IndexedDbProgressStore(factory,'ionic-id');
  const a=service.beginPracticeSession(page,new ReferencePracticeSession(page));
  for(const x of [...pair('species.agno3','species.nacl'),eq('Ag+ + NO3- -> AgNO3')]) await service.applyPracticeCommand(a,ionicIntent(x,'experiment'));
  const before=JSON.stringify(await store.listEvidence());
  const b=await service.retryPracticeSession(a,new ReferencePracticeSession(page));
  for(const x of [...pair('species.agno3','species.nacl'),eq('Ag+ + Cl- -> AgCl')]) await service.applyPracticeCommand(b,ionicIntent(x,'experiment'));
  const all=await store.listEvidence(), attempts=await store.listAttempts();
  assert.equal(attempts.length,2);
  assert.equal(new Set(all.map(e=>e.id)).size,all.length,'unique persisted ids');
  assert.equal(all.filter(e=>e.sourceEvidenceId===`${ID}.mix.species.agno3+species.nacl`).length,2,'one observation per attempt');
  for(const e of JSON.parse(before)) assert.deepEqual(all.find(x=>x.id===e.id),e,'append-only');
  // mastery: bounded — observations ≤ modeled pairs, one correct answer per reaction; repetition adds nothing
  const s=new ReferencePracticeSession(page); let r;
  for(const x of [...pair('species.agno3','species.nacl'),...pair('species.nacl','species.agno3'),eq('Ag+ + Cl- -> AgCl'),eq('Ag+ + Cl- -> AgCl'),...pair('species.agno3','species.nacl')]) r=await s.apply(ionicIntent(x,'experiment'));
  assert.deepEqual(r.evidence.map(e=>e.type).sort(),['answer','construction','observation']);
  const m=computeConceptMastery({conceptId:CONFIG.conceptId,evidence:r.evidence,scoringVersion:r.evidence[0].scoringVersion,context:{scoringVersion:r.evidence[0].scoringVersion}});
  assert.equal(m.evidenceIds.length,3);
});

test('determinism: every KB reactant set under its own conditions has at most one canonical match (no ambiguous collision)',()=>{
  for(const r of REACTIONS){
    for(const policy of ['filter-by-query','require-record-conditions']){
      const m=matcher.match({reactants:r.reactants.map(x=>({formula:x.formula,...(x.phase?{phase:x.phase}:{})})),conditions:r.conditions,conditionPolicy:policy});
      assert.ok(m.modeled?m.reaction.id===r.id:m.code==='REACTION_CONDITION_REQUIRED',`${r.id} ${policy}: ${JSON.stringify(m.modeled?m.reaction.id:m.code)}`);
    }
  }
});
