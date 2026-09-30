// P1.4 closeout — audit blockers before merge: chemical identity vs localized text, the explicit noElementYet
// construction state, the hardened version-range subset (kill-tests), build ⇔ runtime renderer parity, and the
// host error boundary (a renderer failure after mount fails closed without touching the attempt or evidence).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ELEMENT_SYMBOLS,elementByAtomicNumber} from '../src/domain/chemistry/periodic-table.ts';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {deriveAtomState} from '../src/domain/chemistry/atom.ts';
import {parseElementNameCatalog,elementNameMapper,elementNamesPackPath,DEFAULT_LOCALE} from '../src/features/localization/element-names.ts';
import {toAtomRendererModel,NO_ELEMENT_YET_TEXT} from '../src/renderers/atom-builder/renderer-model.ts';
import {satisfiesVersionRange,isVersionRange,isVersion,parseVersionRange} from '../src/runtime/compatibility/version-range.ts';
import {RendererRegistry} from '../src/renderers/registry.ts';
import {ATOM_BUILDER_CAPABILITY} from '../src/renderers/catalog.ts';
import {createDefaultRendererRegistry} from '../src/renderers/index.ts';
import {isRendererRequirement,resolveExecutionPlan} from '../src/runtime/practice-router/execution-plan.ts';
import {rendererAvailable,compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {buildStableSignoffTargets} from '../scripts/stable-signoff-targets.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {renderPracticePage,RENDERER_FAILED_MESSAGE} from '../src/features/practice/host.ts';
import {atomBuilderRenderer} from '../src/renderers/atom-builder/renderer.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {memoryPackFetch} from './helpers/memory-pack.mjs';
import {installMiniDom} from './helpers/mini-dom.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const LOCALE_FILE='content-src/locales/uz-latn/chemistry-elements.json';
const ATOM_ACTIVITY='practice.simulation.7.07.planned';
const tick=()=>new Promise(r=>setTimeout(r,0));

// ------------------------------------------------------------------ identity vs localized text

test('periodic table holds identity only (Z + symbol); localized names live in reviewed content',()=>{
  const src=read('src/domain/chemistry/periodic-table.ts');
  assert.doesNotMatch(src,/Vodorod|Uglerod|Kislorod|nameUz/,'no localized names in the domain');
  assert.deepEqual(Object.keys(elementByAtomicNumber(6)).sort(),['atomicNumber','symbol']);
  const catalog=parseElementNameCatalog(JSON.parse(read(LOCALE_FILE)));
  assert.equal(catalog.locale,'uz-Latn');
  assert.equal(JSON.parse(read(LOCALE_FILE)).reviewStatus,'pending','terminology is not approved by tooling');
  for(const symbol of Object.keys(catalog.names)) assert.ok(ELEMENT_SYMBOLS.includes(symbol),symbol);
  assert.deepEqual(['C','Na','O'].map(elementNameMapper(catalog)),['Uglerod','Natriy','Kislorod']);
  assert.equal(elementNameMapper(catalog)('Fe'),'Fe','no localized name → the international symbol is shown');
  assert.equal(elementNameMapper(undefined)('C'),'C');
  // the locale file is validated fail-closed: unknown symbols / empty names are rejected
  for(const bad of [{...JSON.parse(read(LOCALE_FILE)),names:{Xx:'Nomalum'}},{...JSON.parse(read(LOCALE_FILE)),names:{C:''}},{...JSON.parse(read(LOCALE_FILE)),schema:'x'},null])
    assert.throws(()=>parseElementNameCatalog(bad),/ELEMENT_NAMES_INVALID/);
});

test('the formula parser depends on symbol validity only — never on element names',()=>{
  const src=read('src/domain/chemistry/formula-parser.ts');
  assert.doesNotMatch(src,/localization|locales|elementName|nameUz/);
  assert.match(src,/ELEMENT_SYMBOL_SET/);
  const names=parseElementNameCatalog(JSON.parse(read(LOCALE_FILE))).names;
  // elements with and without a localized name parse alike; a non-symbol fails whatever the names say
  assert.ok(!('Fe' in names)&&!('Og' in names));
  assert.equal(parseFormula('Fe2(SO4)3').normalized,'Fe2(SO4)3');
  assert.equal(parseFormula('Og').normalized,'Og');
  assert.equal(parseFormula('NaCl').normalized,'NaCl');
  assert.throws(()=>parseFormula('Xx2'));
  assert.throws(()=>parseFormula('Uglerod'),'a localized name is not a formula');
});

test('localized terminology is in the CHEM-033 review surface (expertReviewHash) and ships in the pack',()=>{
  const target=buildStableSignoffTargets(root).targets['CHEM-033'];
  assert.ok(target.reviewSurfaceFiles.includes(LOCALE_FILE),'names are covered by the chemistry review hash');
  const pointer=JSON.parse(read('public/content/manifest.json'));
  const shipped=JSON.parse(read(`public/content/${pointer.activeVersion}/${elementNamesPackPath(DEFAULT_LOCALE)}`));
  assert.deepEqual(shipped,JSON.parse(read(LOCALE_FILE)));
});

test('AtomState has no names; the renderer model gets the name from the localization mapper',()=>{
  const s=deriveAtomState({protons:6,neutrons:8,electrons:6});
  assert.ok(!('elementName' in s));
  assert.equal(toAtomRendererModel({finalState:s,goal:s,evidence:[]}).elementName,'C','without a mapper: the symbol');
  const m=toAtomRendererModel({finalState:s,goal:s,evidence:[]},(sym)=>({C:'Carbon'})[sym]??sym);
  assert.deepEqual([m.symbol,m.elementName,m.isotopeLabel],['C','Carbon','Carbon-14'],'the name is presentation, swappable per locale');
});

test('Z = 0 is the explicit noElementYet construction state with non-misleading copy',()=>{
  const empty=deriveAtomState({protons:0,neutrons:0,electrons:0});
  assert.equal(empty.construction,'noElementYet');
  const one=deriveAtomState({protons:1,neutrons:0,electrons:1});
  assert.equal(one.construction,'element');
  const m=toAtomRendererModel({finalState:empty,goal:one,evidence:[]});
  assert.deepEqual([m.construction,m.symbol,m.elementName,m.isotopeLabel],['noElementYet',null,null,null]);
  assert.ok(m.accessibleSummary.startsWith(NO_ELEMENT_YET_TEXT));
  for(const text of [m.accessibleSummary,NO_ELEMENT_YET_TEXT])
    assert.doesNotMatch(text,/noma.?lum|unknown|aniqlanmagan/i,'no "unknown element" wording: nothing is unknown, it is not built yet');
  for(const f of ['src/renderers/atom-builder/renderer.ts','src/renderers/atom-builder/renderer-model.ts'])
    assert.doesNotMatch(read(f).replace(/^\s*\/\/.*$/gm,''),/noma.?lum|aniqlanmagan/i,f);
  assert.throws(()=>toAtomRendererModel({finalState:{...empty,construction:undefined},goal:one}),/ATOM_RENDERER_MODEL_INPUT_INVALID/);
});

// ------------------------------------------------------------------ version-range kill-tests

test('version ranges: the documented subset only, and it does not claim to be npm-semver',()=>{
  const src=read('src/runtime/compatibility/version-range.ts');
  assert.match(src,/NOT npm-semver/);
  for(const r of ['*','1.0.0','^1.0.0','^10.2.3','>=1.0.0','<2.0.0','>=1.0.0 <2.0.0','=1.2.3','>1.0.0 <=1.5.0']) assert.ok(isVersionRange(r),r);
});

test('kill: ^0.x is unsupported and fails closed (never approximated)',()=>{
  for(const r of ['^0.1.0','^0.0.1','^0.0.0']){
    assert.equal(isVersionRange(r),false,r);
    assert.equal(satisfiesVersionRange('0.1.0',r),false,r);
    assert.throws(()=>createDefaultRendererRegistry().resolve({capability:'atom-builder',range:r}),e=>e.code==='RENDERER_REQUIREMENT_INVALID',r);
  }
  // an explicit comparator set still expresses 0.x ranges unambiguously
  assert.ok(satisfiesVersionRange('0.3.0','>=0.1.0 <0.4.0'));
});

test('kill: invalid ranges and unsupported syntax fail closed',()=>{
  for(const r of ['','garbage','^','>=','1','1.0','^1','^1.0','~1.0.0','1.x','1.0.x','x','X','1.0.0 - 2.0.0','^1.0.0 || ^2.0.0','||','>=1.0.0 <2.0.0 !=1.5.0','>=1.0.0 <2.0.0 >0.1.0','!=1.0.0','=>1.0.0','>= 1.0.0','v1.0.0','^v1.0.0',null,undefined,1,{}]){
    assert.equal(isVersionRange(r),false,String(r));
    assert.equal(parseVersionRange(r),null,String(r));
    assert.equal(satisfiesVersionRange('1.0.0',r),false,String(r));
  }
});

test('kill: pre-release and build metadata are rejected everywhere',()=>{
  for(const v of ['1.0.0-beta','1.0.0-rc.1','1.0.0+build.5','1.0.0-0']){
    assert.equal(isVersion(v),false,v);
    assert.equal(satisfiesVersionRange(v,'*'),false,`${v} never matches, not even *`);
    assert.equal(isVersionRange(`^${v}`),false);
    assert.throws(()=>new RendererRegistry().register({capability:{...ATOM_BUILDER_CAPABILITY,version:v},mount(){}}),e=>e.code==='RENDERER_CAPABILITY_INVALID',v);
  }
  for(const v of ['01.0.0','1.00.0','1.0.00','1.0','1','1.0.0.0']) assert.equal(isVersion(v),false,v);
});

test('kill: whitespace is not normalised — surrounding, repeated or tab whitespace is invalid',()=>{
  for(const r of [' ^1.0.0','^1.0.0 ','\t^1.0.0','>=1.0.0  <2.0.0','>=1.0.0\t<2.0.0',' * ','\n1.0.0']) assert.equal(isVersionRange(r),false,JSON.stringify(r));
  assert.equal(isVersionRange('>=1.0.0 <2.0.0'),true);
});

test('kill: major boundary of the caret and of comparators',()=>{
  const cases=[['1.0.0','^1.0.0',true],['1.99.99','^1.0.0',true],['2.0.0','^1.0.0',false],['0.9.9','^1.0.0',false],
    ['2.3.3','^2.3.4',false],['2.3.4','^2.3.4',true],['2.9.0','^2.3.4',true],['3.0.0','^2.3.4',false],
    ['2.0.0','<2.0.0',false],['1.99.99','<2.0.0',true],['2.0.0','<=2.0.0',true],['1.0.0','>1.0.0',false],['1.0.1','>1.0.0',true],
    ['1.10.0','>1.9.0',true],['1.9.0','1.9.0',true],['1.9.1','1.9.0',false]];
  for(const [v,r,expected] of cases) assert.equal(satisfiesVersionRange(v,r),expected,`${v} ${r}`);
});

test('kill: several matching versions → the numerically highest one (1.10.0 beats 1.9.0), never first-registered',()=>{
  const registry=new RendererRegistry();
  for(const version of ['1.9.0','1.10.0','1.2.0','2.0.0']) registry.register({capability:{...ATOM_BUILDER_CAPABILITY,version},mount(){}});
  assert.equal(registry.resolve({capability:'atom-builder',range:'^1.0.0'}).capability.version,'1.10.0');
  assert.equal(registry.resolve({capability:'atom-builder',range:'>=1.0.0 <1.10.0'}).capability.version,'1.9.0');
  assert.equal(registry.resolve({capability:'atom-builder',range:'*'}).capability.version,'2.0.0');
});

// ------------------------------------------------------------------ build ⇔ runtime parity

function* rng(seed){ let x=seed>>>0; for(;;){ x^=x<<13; x>>>=0; x^=x>>17; x^=x<<5; x>>>=0; yield x; } }
function requirements(){
  const handmade=['*','1.0.0','^1.0.0','^1.2.0','^2.0.0','^0.1.0','>=1.0.0 <2.0.0','>=2.0.0','<1.0.0','=1.0.0','~1.0.0','','1','>=1 <2',' ^1.0.0','^1.0.0-beta'];
  const pieces=['','*','^','>=','<=','>','<','=','~','||',' ','  ','0','1','2','.','1.0.0','0.1.0','1.0','2.0.0','1.2.3','01.0.0','-beta','+b','x'];
  const g=rng(20260930);
  const ranges=[...handmade];
  for(let i=0;i<600;i++){ const n=1+g.next().value%4; let r=''; for(let j=0;j<n;j++) r+=pieces[g.next().value%pieces.length]; ranges.push(r); }
  const caps=['atom-builder','hydrolysis-medium','no-such-renderer','','Atom-Builder'];
  const out=[];
  for(const range of ranges) for(const capability of caps) out.push({capability,range});
  out.push({capability:'atom-builder',range:'^1.0.0',activityId:ATOM_ACTIVITY},{capability:'atom-builder'},{range:'^1.0.0'},null);
  return out;
}

test('property: build says compatible ⇔ runtime resolution succeeds (same parser, same selection rule)',()=>{
  const pointer=JSON.parse(read('public/content/manifest.json'));
  const shipped=JSON.parse(read(`public/content/${pointer.activeVersion}/execution-plans.json`));
  const registry=createDefaultRendererRegistry();
  let compatible=0,checked=0;
  for(const requirement of requirements()){
    const build=isRendererRequirement(requirement)&&rendererAvailable(requirement);
    let runtime;
    try{
      const plan=resolveExecutionPlan({...shipped,plans:shipped.plans.map(p=>p.activityId===ATOM_ACTIVITY?{...p,rendererRequirement:requirement}:p)},ATOM_ACTIVITY);
      registry.resolve(plan.rendererRequirement); runtime=true;
    }catch{ runtime=false; }
    assert.equal(build,runtime,JSON.stringify(requirement));
    checked++; if(build) compatible++;
  }
  assert.ok(checked>3000&&compatible>=5,`${compatible}/${checked}`);
});

test('property (full compile): readiness READY ⇔ the runtime registry resolves the compiled requirement',()=>{
  const registry=createDefaultRendererRegistry();
  for(const range of ['^1.0.0','*','1.0.0','>=1.0.0 <2.0.0','^2.0.0','^0.1.0','>=1 <2','~1.0.0']){
    const src=structuredClone(loadSources());
    src.configs['reference-slices'][ATOM_ACTIVITY].rendererRequirement={capability:'atom-builder',range};
    const a=compileReadiness(src).pack.activities.find(x=>x.activityId===ATOM_ACTIVITY);
    let runtime; try{ registry.resolve({capability:'atom-builder',range}); runtime=true; }catch{ runtime=false; }
    assert.equal(a.runtime==='READY',runtime,range);
  }
});

// ------------------------------------------------------------------ host error boundary

async function practiceStack(){
  const client=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  const page=await client.loadPractice(ATOM_ACTIVITY);
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'boundary',{liveness:null});
  const engine=new ReferencePracticeSession(page);
  const attempt=service.beginPracticeSession(page,engine);
  const port={apply:async(command)=>(await service.applyPracticeCommand(attempt,command)).result,current:()=>engine.result()};
  const store=new IndexedDbProgressStore(factory,'boundary');
  const snapshot=async()=>JSON.stringify({attempts:await store.listAttempts(),evidence:await store.listEvidence(),progress:await store.listProgress()});
  return {page,port,store,snapshot};
}

test('host: a renderer that throws AFTER mount fails closed — localized alert, no legacy fallback, attempt and evidence intact',async()=>{
  const dom=installMiniDom();
  try{
    const {page,port,store,snapshot}=await practiceStack();
    let host;
    // the renderer crashes exactly when it has to draw the result that reached the goal (worst case: the
    // learner's successful input must survive the crash)
    const broken={capability:ATOM_BUILDER_CAPABILITY,mount(_root,h){ host=h; return {update(r){ if(r?.evidence?.some(e=>e.achieved)) throw new Error('boom'); },destroy(){}}; }};
    const registry=new RendererRegistry(); registry.register(broken);
    assert.equal(renderPracticePage(dom.root,page,port,registry),'registry');
    await tick();
    const steps=[...Array(6).fill('protons'),...Array(8).fill('neutrons'),...Array(6).fill('electrons')];
    for(const particle of steps.slice(0,-1)) await host.dispatch({kind:'simulation-action',action:{particle,delta:1}});
    const stage=dom.root.querySelector('.kl-renderer-stage');
    assert.equal(stage.dataset.rendererState,undefined,'still healthy before the crash');
    const before=JSON.parse(await snapshot());
    await host.dispatch({kind:'simulation-action',action:{particle:'electrons',delta:1}}); // goal reached → draw throws
    assert.equal(stage.dataset.rendererState,'failed');
    assert.equal(dom.root.querySelector('[role="alert"]').textContent,RENDERER_FAILED_MESSAGE);
    assert.doesNotMatch(dom.root.textContent,/boom|RENDERER_|Error/,'no raw error reaches the learner');
    assert.equal(dom.root.querySelector('form'),null,'no fallback to the legacy form');
    const afterFailure=await snapshot();
    const after=JSON.parse(afterFailure);
    // the learner's successful input was recorded by the orchestrator BEFORE the draw and is kept
    assert.ok(after.evidence.some(e=>e.achieved===true),'the goal evidence survives the renderer crash');
    assert.deepEqual(after.progress.map(p=>[p.learningUnitId,p.status]),[['lu.7.07','practice_complete']]);
    for(const e of before.evidence) assert.deepEqual(after.evidence.find(x=>x.id===e.id),e,'existing evidence immutable');
    for(const a of before.attempts) assert.ok(after.attempts.some(x=>x.id===a.id),'no attempt is replaced');
    // after the failure: intents are refused and nothing more is written (no rollback, no extra records)
    await assert.rejects(host.dispatch({kind:'simulation-action',action:{particle:'protons',delta:1}}),/RENDERER_FAILED/);
    assert.equal(await snapshot(),afterFailure);
    assert.ok((await store.listEvidence()).length>=1);
  }finally{ dom.restore(); }
});

test('host: a renderer that throws AT mount fails closed the same way (no legacy fallback, nothing written)',async()=>{
  const dom=installMiniDom();
  try{
    const {page,port,snapshot}=await practiceStack();
    const before=await snapshot();
    const registry=new RendererRegistry(); registry.register({capability:ATOM_BUILDER_CAPABILITY,mount(){ throw new Error('mount-boom'); }});
    assert.equal(renderPracticePage(dom.root,page,port,registry),'registry');
    await tick();
    assert.equal(dom.root.querySelector('[role="alert"]').textContent,RENDERER_FAILED_MESSAGE);
    assert.equal(dom.root.querySelector('form'),null);
    assert.equal(await snapshot(),before);
  }finally{ dom.restore(); }
});

test('host + real atom renderer: noElementYet copy, then the localized name from the content pack',async()=>{
  const dom=installMiniDom();
  try{
    const {page,port}=await practiceStack();
    assert.equal(page.localization.elementNames.names.H,'Vodorod','ContentClient loads the locale file');
    renderPracticePage(dom.root,page,port,createDefaultRendererRegistry());
    await tick();
    const cell=()=>dom.root.querySelector('[data-field="element"]').textContent;
    assert.equal(cell(),NO_ELEMENT_YET_TEXT);
    const plus=dom.root.querySelector('[data-particle="protons"]').querySelectorAll('button').find(b=>/qo‘shish/.test(b.getAttribute('aria-label')));
    plus.click();
    for(let i=0;i<20;i++) await tick();
    assert.equal(cell(),'H — Vodorod');
  }finally{ dom.restore(); }
});
