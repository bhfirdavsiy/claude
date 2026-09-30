// P1.6 — ionic-precipitation reference renderer: domain authorities (ReactionMatcher, IonicEngine, species,
// solubility), modeled reaction vs explicit modeled no-reaction vs not modeled, condition-aware matching, learner
// reagent choice, net ionic equation validation (order-insensitive, syntax vs chemistry), meaningful evidence,
// completion, the chemistry-free converter, the renderer flow, and the third-capability registry proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ReactionMatcher,NO_REACTION_TYPE} from '../src/domain/chemistry/reaction-matcher.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {SpeciesRegistry} from '../src/domain/chemistry/species-registry.ts';
import {compareNetIonic,parseIonicEquation} from '../src/domain/chemistry/ionic-equation.ts';
import {evaluateIonicMixing,resolveShelf} from '../src/domain/chemistry/ionic-mixing.ts';
import {validateEvidence} from '../src/runtime/evidence/types.ts';
import {toIonicPrecipitationRendererModel,IONIC_RENDERER_MODEL_SCHEMA} from '../src/renderers/ionic-precipitation/renderer-model.ts';
import {ionicIntent,ionicPrecipitationRenderer} from '../src/renderers/ionic-precipitation/renderer.ts';
import {commandFor} from '../src/renderers/intent.ts';
import {RENDERER_CATALOG,IONIC_PRECIPITATION_CAPABILITY} from '../src/renderers/catalog.ts';
import {createDefaultRendererRegistry} from '../src/renderers/index.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {isReleaseReady} from '../src/domain/readiness/readiness.ts';
import {buildIonicReport,IONIC_REPORT} from '../scripts/renderer-reports.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {renderPracticePage} from '../src/features/practice/host.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {memoryPackFetch} from './helpers/memory-pack.mjs';
import {installMiniDom} from './helpers/mini-dom.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const src=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const REACTIONS=read('content-src/chemistry/reactions.json'), RULES=read('content-src/chemistry/solubility.json'), SPECIES=read('content-src/chemistry/species.json');
const CONFIG=read('content-src/activity-configs/reference-slices.json')['practice.experiment.8.1'];
const domain=(reactions=REACTIONS)=>({species:SpeciesRegistry.from(SPECIES),matcher:ReactionMatcher.from(reactions),ionic:IonicEngine.from({reactions,rules:RULES})});
const ID='practice.experiment.8.1', TARGET=CONFIG.reactionId;
const RAW_CODE=/\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
const pick=(slot,speciesId)=>({type:'selectReagent',payload:{slot,speciesId}}), mix={type:'mix'}, eq=(equation)=>({type:'writeEquation',payload:{equation}});
const pair=(a,b)=>[pick('A',a),pick('B',b),mix];
const settle=async()=>{ for(let i=0;i<30;i++) await new Promise(r=>setTimeout(r,0)); };
const client=()=>new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
async function run(actions){ const page=await client().loadPractice(ID); const s=new ReferencePracticeSession(page); let r=await s.result(); for(const a of actions) r=await s.apply(ionicIntent(a,page.type)); return {page,r}; }
const expectedOf=(id)=>domain().ionic.netIonicEquation(id).equation;

// ------------------------------------------------------------------ domain audit

test('domain audit: KB counted from content; authorities are ReactionMatcher / IonicEngine / species / solubility',()=>{
  const report=read(IONIC_REPORT);
  assert.equal(REACTIONS.length,read('reports/chemistry-validation.json').reactionRecords,'count from content, not hardcoded');
  for(const r of REACTIONS){ assert.ok(r.reactants.length&&r.products.length&&r.observations.length&&r.sourceRefs.length&&r.molecularEquation,r.id); }
  // every shelf reagent is a real species AND a solution (dissociation rule) — the IonicEngine can reason about it
  const shelf=resolveShelf(domain(),CONFIG.reagentShelf,TARGET);
  assert.deepEqual(shelf.map(r=>r.speciesId),CONFIG.reagentShelf);
  for(const r of shelf) assert.equal(domain().ionic.dissociate(r.formula).modeled,true,r.formula);
  assert.throws(()=>resolveShelf(domain(),['species.agno3','species.h2o'],TARGET),/IONIC_SHELF_NOT_SOLUTION/);
  assert.throws(()=>resolveShelf(domain(),['species.agno3','species.nope'],TARGET),/IONIC_SHELF_INVALID/);
  assert.throws(()=>resolveShelf(domain(),['species.bacl2','species.h2so4'],TARGET),/IONIC_TARGET_UNREACHABLE/,'the target must be reachable from the shelf');
  assert.deepEqual(report.availableReagents.map(r=>r.speciesId),CONFIG.reagentShelf);
});

test('matcher: modeled reaction, explicit modeled no-reaction and not-modeled are three different results',()=>{
  const noReaction={id:'rxn.test.nacl-nano3',reactants:[{formula:'NaCl'},{formula:'NaNO3'}],products:[],conditions:{tags:[]},direction:'forward',reactionType:NO_REACTION_TYPE,molecularEquation:'NaCl + NaNO3 → (no reaction)',observations:[{type:'no-visible-change'}],safety:[],curriculumRefs:[],sourceRefs:[{id:'src.test',type:'internal',title:'fixture'}],version:'1.0.0'};
  const d=domain([...REACTIONS,noReaction]);
  const shelf=CONFIG.reagentShelf;
  const s=(actions)=>evaluateIonicMixing(d,{shelf,targetReactionId:TARGET,actions});
  assert.equal(s(pair('species.agno3','species.nacl')).current.outcome,'reaction');
  assert.deepEqual([s(pair('species.nacl','species.nano3')).current.outcome,s(pair('species.nacl','species.nano3')).current.reactionId],['no-reaction','rxn.test.nacl-nano3']);
  assert.deepEqual([s(pair('species.agno3','species.nano3')).current.outcome,s(pair('species.agno3','species.nano3')).current.coverageCode],['not-modeled','REACTION_NOT_MODELED']);
  // a no-reaction record may not claim products or a visible change
  assert.throws(()=>ReactionMatcher.from([{...noReaction,products:[{formula:'NaNO3'}]}]),/REACTION_INVALID/);
  assert.throws(()=>ReactionMatcher.from([{...noReaction,observations:[{type:'precipitate',color:'white'}]}]),/REACTION_INVALID/);
  // the renderer names them differently — "not modeled" is never shown as "no reaction"
  const m=(actions)=>toIonicPrecipitationRendererModel({finalState:{ionic:s(actions)},evidence:[]});
  assert.equal(m(pair('species.nacl','species.nano3')).reactionState,'modeled-no-reaction');
  assert.match(m(pair('species.nacl','species.nano3')).observation.text,/reaksiya bormaydi \(modelda shunday qayd etilgan\)/);
  assert.equal(m(pair('species.agno3','species.nano3')).reactionState,'not-modeled');
  assert.match(m(pair('species.agno3','species.nano3')).observation.text,/modelda yo‘q.*“reaksiya bormaydi” degani emas/);
});

test('matcher: records that need other conditions (heating, concentrated acid) do not apply to mixing two solutions',()=>{
  const d=domain();
  // rxn.nacl-h2so4 needs concentrated acid + gentle heating — the legacy 'filter-by-query' policy ignores that
  const loose=d.matcher.match({reactants:[{formula:'NaCl',phase:'aq'},{formula:'H2SO4',phase:'aq'}],conditionPolicy:'filter-by-query'});
  assert.equal(loose.modeled,true,'legacy behaviour unchanged for existing callers');
  assert.deepEqual(d.matcher.match({reactants:[{formula:'NaCl',phase:'aq'},{formula:'H2SO4',phase:'aq'}],conditionPolicy:'require-record-conditions'}),{modeled:false,code:'REACTION_CONDITIONS_NOT_MET'});
  const st=evaluateIonicMixing(d,{shelf:CONFIG.reagentShelf,targetReactionId:TARGET,actions:pair('species.nacl','species.h2so4')});
  assert.deepEqual([st.current.outcome,st.current.coverageCode,st.current.observations],['not-modeled','REACTION_CONDITIONS_NOT_MET',null],'no gas is invented for a room-temperature dilute mix');
});

// ------------------------------------------------------------------ net ionic equation

test('equation: order-insensitive and notation-tolerant; coefficients, sides and phases still matter',()=>{
  const E=expectedOf(TARGET);
  assert.equal(E,'Ag+ + Cl- → AgCl(s)','expected from IonicEngine');
  for(const ok of ['Ag+ + Cl- -> AgCl','Cl- + Ag+ → AgCl(s)','Ag+ + Cl- = AgCl','Ag+(aq) + Cl-(aq) -> AgCl(s)','Ag⁺ + Cl⁻ → AgCl↓','Ag^+ + Cl^- => AgCl','  Ag+  +  Cl-  ->  AgCl  ','Ag+ + Cl− → AgCl'])
    assert.deepEqual(compareNetIonic(ok,E),{syntax:'ok',correct:true},ok);
  for(const wrong of ['2Ag+ + 2Cl- -> 2AgCl','Ag+ + Cl- -> AgCl(aq)','AgCl -> Ag+ + Cl-','Ag+ + NO3- -> AgNO3','Ag+ + Cl- + Na+ -> AgCl + Na+','Na+ + Cl- -> NaCl'])
    assert.deepEqual(compareNetIonic(wrong,E),{syntax:'ok',correct:false},wrong);
  for(const [bad,reason] of [['','empty'],['Ag+ Cl- AgCl','arrow'],['Ag+ + Cl- -> AgCl -> X','arrow'],['Ag++Cl- -> AgCl','formula'],['SO42- + Ba2+ -> BaSO4','formula'],['Xx+ + Cl- -> AgCl','formula']])
    assert.deepEqual(compareNetIonic(bad,E),{syntax:'error',reason},bad);
  // other reactions of the shelf, compared the same way
  assert.equal(compareNetIonic('SO4^2- + Ba2+ -> BaSO4',expectedOf('rxn.bacl2-h2so4')).correct,true);
  assert.equal(compareNetIonic('SO₄²⁻ + Ba²⁺ → BaSO₄↓',expectedOf('rxn.bacl2-h2so4')).correct,true);
  assert.equal(compareNetIonic('2OH- + Zn2+ -> Zn(OH)2',expectedOf('rxn.zncl2-naoh')).correct,true);
  assert.equal(compareNetIonic('OH- + Zn2+ -> Zn(OH)2',expectedOf('rxn.zncl2-naoh')).correct,false,'coefficient');
  assert.equal(parseIonicEquation('NO3- + NH4+ -> NH4NO3').ok,true,'single-charge polyatomic ions without a caret');
});

// ------------------------------------------------------------------ mixing flow + evidence

test('reagent choice: identity is the species id (labels are display only); invalid choices are rejected, not guessed',()=>{
  const d=domain(), shelf=CONFIG.reagentShelf;
  const s=(actions)=>evaluateIonicMixing(d,{shelf,targetReactionId:TARGET,actions});
  assert.equal(s([pick('A','AgNO3')]).rejected,'REAGENT_NOT_AVAILABLE','a formula/label is not an identity');
  assert.equal(s([pick('A','species.cuso4')]).rejected,'REAGENT_NOT_AVAILABLE','not on the shelf');
  assert.equal(s([pick('C','species.agno3')]).rejected,'IONIC_ACTION_INVALID');
  assert.equal(s([pick('A','species.agno3'),mix]).rejected,'MIX_INCOMPLETE');
  assert.equal(s([pick('A','species.agno3'),pick('B','species.agno3'),mix]).rejected,'MIX_SAME_REAGENT');
  assert.equal(s([pick('A','species.agno3'),pick('B','species.nacl')]).current,null,'selection alone never reacts: mixing is an explicit action');
  const again=s([...pair('species.agno3','species.nacl'),pick('B','species.bacl2'),pick('B','species.nacl'),mix,pick('A','species.nacl'),pick('B','species.agno3'),mix]);
  assert.equal(again.mixes.length,1,'mixing the same pair again (either order) adds nothing');
  assert.equal(s([...pair('species.agno3','species.nacl'),pick('B','species.bacl2')]).current,null,'a new selection clears the observation');
  assert.equal(s([eq('Ag+ + Cl- -> AgCl')]).rejected,'EQUATION_NO_REACTION');
  assert.equal(s([...pair('species.agno3','species.nano3'),eq('Ag+ + Cl- -> AgCl')]).rejected,'EQUATION_NO_REACTION','no equation for an unmodeled pair');
  const syntax=s([...pair('species.agno3','species.nacl'),eq('Ag+ Cl- AgCl')]);
  assert.deepEqual([syntax.rejected,syntax.syntaxReason,syntax.equations.length],['EQUATION_SYNTAX','arrow',0]);
  const solved=s([...pair('species.agno3','species.nacl'),eq('Ag+ + Cl- -> AgCl'),eq('Ag+ + Cl- -> AgCl')]);
  assert.deepEqual([solved.rejected,solved.equations.length,solved.achieved],['EQUATION_ALREADY_SOLVED',1,true]);
});

test('domain parity: every shelf pair → engine result = ReactionMatcher (strict) = renderer state (no duplicated table)',async()=>{
  const d=domain(), shelf=CONFIG.reagentShelf, page=await client().loadPractice(ID);
  const formula=(id)=>d.species.byId(id).formula;
  const outcomes=new Set();
  for(let i=0;i<shelf.length;i++) for(let j=i+1;j<shelf.length;j++){
    const m=d.matcher.match({reactants:[{formula:formula(shelf[i]),phase:'aq'},{formula:formula(shelf[j]),phase:'aq'}],conditionPolicy:'require-record-conditions'});
    const s=new ReferencePracticeSession(page); let r;
    for(const a of pair(shelf[i],shelf[j])) r=await s.apply(ionicIntent(a,page.type));
    const cur=r.finalState.ionic.current, model=toIonicPrecipitationRendererModel(r);
    assert.equal(cur.outcome,m.modeled?'reaction':'not-modeled',`${shelf[i]}+${shelf[j]}`);
    assert.equal(cur.reactionId,m.modeled?m.reaction.id:null);
    assert.deepEqual(cur.observations,m.modeled?m.reaction.observations:null,'observation comes from the KB record');
    assert.equal(model.reactionState,m.modeled?'modeled-reaction':'not-modeled');
    if(m.modeled) outcomes.add(m.reaction.id);
  }
  assert.ok(outcomes.size>=2,'black swan: different pairs → different modeled reactions');
});

test('evidence is meaningful, never per click: selections nothing, unmodeled pair nothing, one record per modeled pair / equation',async()=>{
  const {r}=await run([pick('A','species.agno3'),pick('B','species.nano3'),mix,pick('B','species.nacl'),pick('B','species.bacl2'),pick('B','species.nacl'),mix,mix,eq('Ag+ Cl- AgCl'),eq('Ag+ + NO3- -> AgNO3'),eq('Cl- + Ag+ -> AgCl')]);
  const obs=r.evidence.filter(e=>e.type==='observation'), ans=r.evidence.filter(e=>e.type==='answer');
  assert.deepEqual(obs.map(e=>[e.observationKind,e.reagents,e.outcome,e.reactionId,e.observation.type]),[['ionic-mixing',['species.agno3','species.nacl'],'reaction',TARGET,'precipitate']]);
  assert.deepEqual(ans.map(e=>[e.answerKind,e.response,e.correct,e.score,e.canonicalExpected]),[['net-ionic-equation','Ag+ + NO3- -> AgNO3',false,0,expectedOf(TARGET)],['net-ionic-equation','Cl- + Ag+ -> AgCl',true,1,expectedOf(TARGET)]]);
  assert.equal(r.evidence.filter(e=>e.type==='construction').length,1);
  for(const e of r.evidence) assert.doesNotThrow(()=>validateEvidence(e),e.id);
  assert.equal(r.evidence[0].activityVersion,'2.0.0','the evaluation semantics changed → config version 2.0.0');
  // the subtype contracts: an unmodeled pair can never be chemistry evidence; fields are reserved
  const o=obs[0];
  assert.throws(()=>validateEvidence({...o,outcome:'not-modeled'}),/modeled result/);
  assert.throws(()=>validateEvidence({...o,observationKind:undefined}),/require observationKind/);
  assert.throws(()=>validateEvidence({...ans[0],canonicalExpected:undefined}),/net ionic fields required/);
  const {answerKind:_a,...plain}=ans[0];
  assert.throws(()=>validateEvidence(plain),/require answerKind/);
});

test('completion: target reaction observed AND its equation correct — nothing else completes; expected never leaks early',async()=>{
  const done=await run([...pair('species.agno3','species.nacl'),eq('Ag+ + Cl- -> AgCl')]);
  assert.equal(isPracticeResultComplete('experiment',done.r),true);
  const other=await run([...pair('species.bacl2','species.h2so4'),eq('Ba2+ + SO4^2- -> BaSO4')]);
  assert.equal(other.r.finalState.ionic.solved.includes('rxn.bacl2-h2so4'),true);
  assert.equal(isPracticeResultComplete('experiment',other.r),false,'another reaction solved correctly does not complete the target task');
  const wrong=await run([...pair('species.agno3','species.nacl'),eq('Ag+ + NO3- -> AgNO3')]);
  assert.equal(isPracticeResultComplete('experiment',wrong.r),false,'observed but wrong equation');
  const observedOnly=await run(pair('species.agno3','species.nacl'));
  assert.equal(isPracticeResultComplete('experiment',observedOnly.r),false);
  // before any submission the expected equation is nowhere in the engine state or the renderer model
  const E=expectedOf(TARGET);
  assert.ok(!JSON.stringify(observedOnly.r.finalState).includes(E));
  assert.ok(!JSON.stringify(toIonicPrecipitationRendererModel(observedOnly.r)).includes(E));
  assert.ok(!JSON.stringify(toIonicPrecipitationRendererModel(wrong.r)).includes(E),'not even after a wrong answer (only the audit evidence has it)');
});

// ------------------------------------------------------------------ converter + renderer

test('IonicPrecipitationRendererModel: canonical converter, serializable, localized, colour as text, no raw codes',async()=>{
  const {r}=await run(pair('species.agno3','species.nacl'));
  const m=toIonicPrecipitationRendererModel(r);
  assert.equal(m.schema,IONIC_RENDERER_MODEL_SCHEMA);
  assert.deepEqual(m.reagents.map(x=>x.label),['AgNO₃','NaCl','BaCl₂','H₂SO₄','ZnCl₂','NaOH','NaNO₃']);
  assert.deepEqual([m.reactionState,m.observation.precipitate,m.observation.precipitateColor,m.observation.text],['modeled-reaction',true,'Oq','AgNO₃ + NaCl: Oq cho‘kma hosil bo‘ldi.']);
  assert.deepEqual([m.equation.canWrite,m.equation.solved],[true,false]);
  assert.deepEqual(JSON.parse(JSON.stringify(m)),m);
  const notModeled=toIonicPrecipitationRendererModel((await run(pair('species.agno3','species.nano3'))).r);
  for(const x of [m,notModeled]) for(const t of [x.accessibleSummary,x.observation.text,x.equation.syntaxHelp]){ assert.doesNotMatch(t,RAW_CODE); assert.doesNotMatch(t,/\b(white|yellow|precipitate|reaction)\b/); }
  assert.equal(notModeled.equation.canWrite,false);
  assert.throws(()=>toIonicPrecipitationRendererModel({finalState:{status:'x'}}),/IONIC_RENDERER_MODEL_INPUT_INVALID/);
  // the converter holds colour WORDS only — never which reagents give which precipitate
  const converter=src('src/renderers/ionic-precipitation/renderer-model.ts');
  assert.doesNotMatch(converter,/AgCl|BaSO4|Zn\(OH\)2|insoluble|dissociat/);
  // the syntax help must not hint at an answer: none of the shelf reactions' ions appear in it
  for(const ion of ['Ag+','Cl-','Ba2+','SO4^2-','Zn2+','OH-']) assert.ok(!m.equation.syntaxHelp.includes(ion),ion);
});

test('renderer flow (mini DOM): select → mix → observation → equation with help, wrong then right → goal',async()=>{
  const dom=installMiniDom();
  try{
    const page=await client().loadPractice(ID);
    const s=new ReferencePracticeSession(page);
    renderPracticePage(dom.root,page,{apply:c=>s.apply(c),current:()=>s.result()},createDefaultRendererRegistry());
    await settle();
    const q=(sel)=>dom.root.querySelector(sel);
    const choose=async(slot,id)=>{ const el=q(`[data-slot="${slot}"]`); el.value=id; el.dispatch('change'); await settle(); };
    assert.equal(q('[data-action="mix"]').disabled,true,'no mix before two reagents');
    assert.equal(q('[data-field="equation-input"]').disabled,true,'no equation before an observed reaction');
    assert.equal(q('[data-slot="A"]').querySelectorAll('option').length,8,'placeholder + the domain shelf');
    await choose('A','species.agno3'); await choose('B','species.nacl');
    assert.equal(q('[data-action="mix"]').disabled,false);
    q('[data-action="mix"]').click(); await settle();
    assert.equal(q('.kl-ionic__observation').dataset.reactionState,'modeled-reaction');
    assert.equal(q('.kl-ionic__observation').textContent,'AgNO₃ + NaCl: Oq cho‘kma hosil bo‘ldi.');
    const input=q('[data-field="equation-input"]');
    assert.equal(input.disabled,false);
    assert.match(q(`#${input.getAttribute('aria-describedby')}`).textContent,/PO4\^3-/,'syntax help is tied to the field');
    const submit=async(text)=>{ input.value=text; q('form').dispatch('submit'); await settle(); };
    await submit('Ag+ + NO3- -> AgNO3');
    assert.equal(q('.kl-ionic__result').dataset.result,'incorrect');
    assert.match(q('.kl-ionic__result').textContent,/^✗ Tenglama noto‘g‘ri/);
    await submit('Ag+ Cl- AgCl');
    assert.equal(q('.kl-ionic__result').textContent,'Tenglamada bitta strelka (->) bo‘lishi kerak.','syntax help, not a verdict');
    await submit('Cl- + Ag+ -> AgCl');
    assert.equal(q('.kl-ionic__goal-state').dataset.goal,'reached');
    assert.equal(q('[data-field="equation"]').textContent,'✓ To‘g‘ri yozilgan');
    assert.equal(q('[role="status"]').getAttribute('aria-live'),'polite');
    assert.match(q('[role="status"]').textContent,/Maqsadga yetildi/);
  }finally{ dom.restore(); }
});

// ------------------------------------------------------------------ registry: third capability

test('registry: three capabilities, no capability-specific branch in the core, practiceType stays generic',async()=>{
  const registry=createDefaultRendererRegistry();
  assert.deepEqual(registry.capabilities().map(c=>c.id),['atom-builder','hydrolysis-medium','ionic-precipitation']);
  assert.equal(registry.resolve({capability:'ionic-precipitation',range:'^1.0.0'}),ionicPrecipitationRenderer);
  assert.equal(ionicPrecipitationRenderer.capability,IONIC_PRECIPITATION_CAPABILITY);
  for(const f of ['src/renderers/registry.ts','src/features/practice/host.ts','src/renderers/contract.ts','src/renderers/intent.ts'])
    assert.doesNotMatch(src(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,''),/'(atom-builder|hydrolysis-medium|ionic-precipitation)'/,`${f}: no branch on a capability id`);
  // the mount context did not grow for the third renderer; practiceType is the page's engine family
  const ctx=src('src/renderers/contract.ts').match(/interface RendererMountContext \{([\s\S]*?)\n\}/)[1];
  // P1.7: the element-specific `elementName` mapper became ONE generic content-backed `localize(key)` (element and
  // species names) — the context still has four fields; it did not grow with the third renderer or with P1.7.
  assert.deepEqual([...ctx.matchAll(/^\s*(\w+)\??:/gm)].map(m=>m[1]),['title','goal','localize','practiceType']);
  assert.deepEqual(commandFor('experiment',{type:'mix'}),{kind:'experiment-action',action:{type:'mix'}});
  assert.throws(()=>commandFor('trainer',{type:'mix'}),/RENDERER_PRACTICE_TYPE_UNSUPPORTED/);
  // one readiness path for all three
  for(const [id,source,capability] of [['practice.simulation.7.07.planned','reference-slices','atom-builder'],['practice.experiment.9.14','beta2-advanced','hydrolysis-medium'],[ID,'reference-slices','ionic-precipitation']]){
    const s=structuredClone(loadSources()); s.configs[source][id].rendererRequirement={capability,range:'^2.0.0'};
    const a=compileReadiness(s).pack.activities.find(x=>x.activityId===id);
    assert.deepEqual([a.runtime,a.reasons[0]],['BLOCKED','RENDERER_UNAVAILABLE'],id);
  }
  assert.deepEqual(RENDERER_CATALOG.map(c=>c.id),registry.capabilities().map(c=>c.id));
});

test('governance: renderer added ≠ released; review status unchanged; counts unchanged',()=>{
  const withReq=compileReadiness(structuredClone(loadSources())).pack.activities.find(a=>a.activityId===ID);
  const s=structuredClone(loadSources()); delete s.configs['reference-slices'][ID].rendererRequirement;
  const without=compileReadiness(s).pack.activities.find(a=>a.activityId===ID);
  assert.deepEqual(withReq,without);
  assert.equal(withReq.content,'REVIEW_PENDING'); assert.equal(isReleaseReady(withReq),false);
  const a=read('content-src/practice-activities.json').find(x=>x.id===ID);
  assert.deepEqual(Object.values(a.approvals).map(x=>typeof x==='string'?x:x.status),['pending','pending','pending','pending']);
  const v=read('public/content/manifest.json').activeVersion;
  const readiness=read(`public/content/${v}/activity-readiness.json`);
  const count=(k)=>readiness.activities.filter(x=>x.runtime===k).length;
  assert.deepEqual([count('READY'),count('PENDING'),count('DISABLED')],[118,27,1]);
  assert.deepEqual(read('content-src/pilot-signoffs.json').records,[]);
});

test('guards: the ionic renderer never imports the KB, solubility rules or configs; the package is clean',()=>{
  const rules=(code)=>checkSource('src/renderers/ionic-precipitation/renderer.ts',code).map(v=>v.rule);
  for(const bad of [
    "import rx from '../../../content-src/chemistry/reactions.json' with {type:'json'};",
    "import sol from '../../../content-src/chemistry/solubility.json' with {type:'json'};",
    "const r=await fetch('/content/2026.09.1/chemistry/reactions.json');",
  ]) assert.ok(rules(bad).includes('RENDERER_IMPORTS_CONTENT_DATA'),bad);
  for(const [code,rule] of [
    ["import {ReactionMatcher} from '../../domain/chemistry/reaction-matcher.ts';",'CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER'],
    ["import {IonicEngine} from '../../domain/chemistry/ionic-engine.ts';",'CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER'],
    ["import {compareNetIonic} from '../../domain/chemistry/ionic-equation.ts';",'CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER'],
    ["import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';",'RENDERER_IMPORTS_PERSISTENCE'],
    ["import {buildMasteryView} from '../../domain/mastery/view.ts';",'RENDERER_IMPORTS_MASTERY'],
    ["import {launchDecision} from '../../domain/readiness/readiness.ts';",'RENDERER_DERIVES_READINESS'],
    ["if(page.id==='practice.experiment.8.1') return x;",'RENDERER_SELECTED_BY_ACTIVITY_ID'],
    ["const T=['Ag','Cl','Ba','Zn'];",'CHEMISTRY_COMPUTED_IN_RENDERER'],
  ]) assert.ok(rules(code).includes(rule),`${rule}: ${code}`);
  for(const f of fs.readdirSync(path.join(root,'src/renderers'),{recursive:true}).map(String).filter(f=>f.endsWith('.ts')))
    assert.deepEqual(checkSource(`src/renderers/${f}`,src(`src/renderers/${f}`)),[],f);
});

test('ionic report: deterministic, PASS — and FAILS when the KB makes the flow canned',async()=>{
  const report=await buildIonicReport();
  assert.deepEqual(read(IONIC_REPORT),report,'run npm run renderer:reports');
  assert.equal(report.status,'PASS');
  assert.ok(report.distinctOutcomes>=2);
  assert.equal(report.accessibility.keyboardE2E.keyboardOnly,true);
  assert.equal(report.modeledNoReactionPairs,0,'the KB has no explicit no-reaction record (known limitation)');
  // canned: only the target reaction modeled → one outcome → FAIL
  const canned=REACTIONS.filter(r=>r.id===TARGET||!['rxn.bacl2-h2so4','rxn.zncl2-naoh'].includes(r.id));
  const cannedReport=await buildIonicReport(root,{reactions:canned});
  assert.equal(cannedReport.status,'FAIL');
  assert.equal(cannedReport.checks.modelBased,false);
});
