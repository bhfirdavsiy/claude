// P2.14 — Substance Passport + Reaction Explorer (ADR-P2-015): canonical identity, derived facts, the ReactionMatcher
// semantics (modeled / explicit no-reaction / not modeled), conditions that fail closed, ionic equations only where
// supported, governance that is never bypassed, one canonical graph, routes, flags, search, catalog and reports.
// The browser-level checks (deep links on both hosts, parity, keyboard, 320 px, announcements) are in
// tests/e2e/substance-reaction.spec.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {ReactionMatcher} from '../src/domain/chemistry/reaction-matcher.ts';
import {SpeciesRegistry} from '../src/domain/chemistry/species-registry.ts';
import {parseConditionVocabulary} from '../src/domain/chemistry/condition-vocabulary.ts';
import {buildChemistryKnowledge,decimalSum,refIds} from '../scripts/lib/chemistry-knowledge.ts';
import {deriveChemistryGraph} from '../scripts/lib/chemistry-graph.ts';
import {buildElementHub} from '../scripts/lib/element-hub.ts';
import {elementAssertion} from '../scripts/lib/element-governance.ts';
import {assertKnowledgeIndex,CHEMISTRY_KNOWLEDGE_SCHEMA,RELATION_PROVENANCE,substanceKey} from '../src/features/chemistry-knowledge/knowledge.ts';
import {explore,explorerHref,parseExplorerQuery,reactionExplorerHref,resolveFormulaInput,substanceSearchEntries,reactionSearchEntries,knowledgeDomain,MAX_REAGENTS} from '../src/features/chemistry-knowledge/explorer.ts';
import {searchStudentContent} from '../src/features/search/model.ts';
import {parseAppRoute} from '../src/app/routes.ts';
import {FEATURE_FLAGS,isFeatureEnabled} from '../src/app/feature-flags.ts';
import {knowledgeOutputs,KNOWLEDGE_REPORTS} from '../scripts/chemistry-knowledge-report.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const json=(rel)=>JSON.parse(read(rel));
const SPECIES=json('content-src/chemistry/species.json');
const REACTIONS=json('content-src/chemistry/reactions.json');
const vocabulary=parseConditionVocabulary(json('content-src/chemistry/condition-vocabulary.json'));
const domain=knowledgeDomain({species:SPECIES,reactions:REACTIONS,conditionVocabulary:json('content-src/chemistry/condition-vocabulary.json')});
const {index,graph,governance}=buildChemistryKnowledge(root);
const sub=(id)=>index.substances.find(s=>s.id===id);
const rxn=(id)=>index.reactions.find(r=>r.id===id);
const LABELS=json('content-src/locales/uz-latn/learner-interaction.json').labels;

// TEST-ONLY fixtures (never repository content): an eligible registered source, a human decision, and species /
// reaction records built to exercise the mechanics — they claim nothing about real chemistry. Fixture masses are
// deliberately not real atomic masses.
const H=(c)=>c.repeat(64);
const FIX_REGISTRY={schema:'kimyolab.source-registry.v1',sources:[...json('content-src/source-registry.json').sources,
  {id:'src.test.accepted',category:'AUTHORITATIVE_REFERENCE',title:'Test fixture reference',classification:'HUMAN_ACCEPTED',acceptedBy:'Test Reviewer',acceptedAt:'2026-01-01T00:00:00.000Z',reviewedHash:H('a')}]};
const CHEM=(records)=>({schema:'kimyolab.chemistry-reviews.v1',records});
const APPROVE=(g,over={})=>({assertionId:g.assertionId,assertionHash:g.hash,decision:'approve',reviewerId:'Test Kimyogar',reviewerRole:'chemistry',reviewedAt:'2026-02-01T00:00:00.000Z',...over});
const withSource=(id,src)=>REACTIONS.map(r=>r.id===id?{...r,sourceRefs:[{id:src,type:'reference',title:'fixture'}]}:r);

// ------------------------------------------------------------------ identity

test('1. species identity is never deduplicated by formula alone (phase / charge are identity)',()=>{
  const nacl=SPECIES.find(s=>s.id==='species.nacl');
  const species=[...SPECIES,{...nacl,id:'species.nacl-aq-fixture',phase:'aq'}];
  const g=deriveChemistryGraph(root,{species});
  assert.equal(g.registry.size,SPECIES.length+1);
  const {index:ix}=buildChemistryKnowledge(root,{species});
  assert.ok(ix.substances.some(s=>s.id==='species.nacl')&&ix.substances.some(s=>s.id==='species.nacl-aq-fixture'));
  // a typed formula that two canonical species share asks the learner — it never picks one
  assert.deepEqual(resolveFormulaInput(g.registry,'NaCl'),{status:'AMBIGUOUS',speciesIds:['species.nacl','species.nacl-aq-fixture']});
  // with the aq species present the record that names NaCl(aq) resolves (phase-aware), the solid keeps its own links
  assert.deepEqual(ix.reactions.find(r=>r.id==='rxn.agno3-nacl').participants.reactants,['species.agno3','species.nacl-aq-fixture']);
  assert.ok(!ix.substances.find(s=>s.id==='species.nacl').relations.reactions.includes('rxn.agno3-nacl'));
  // the route key is the species id (never the formula)
  assert.equal(substanceKey('species.nacl'),'nacl');
  assert.equal(parseAppRoute('/substance/NaCl').name,'not-found');
});

test('2. a duplicate canonical species identity or id fails closed',()=>{
  const nacl=SPECIES.find(s=>s.id==='species.nacl');
  assert.throws(()=>buildChemistryKnowledge(root,{species:[...SPECIES,{...nacl,id:'species.nacl-copy'}]}),/SPECIES_DUPLICATE_IDENTITY/);
  assert.throws(()=>buildChemistryKnowledge(root,{species:[...SPECIES,{...nacl,phase:'aq'}]}),/SPECIES_DUPLICATE_ID/);
  assert.throws(()=>buildChemistryKnowledge(root,{species:[...SPECIES,{...nacl,id:'nacl-without-namespace',phase:'g'}]}),/SUBSTANCE_ID_NAMESPACE/);
  assert.throws(()=>assertKnowledgeIndex({...index,substances:[...index.substances,index.substances[0]]}),/CHEMISTRY_KNOWLEDGE_INVALID:substance/);
});

test('3. composition comes from the canonical formula parser (no second parser, no renderer regex)',()=>{
  for(const s of index.substances){
    const sp=SPECIES.find(x=>x.id===s.id);
    if(s.composition.status==='DERIVED'){ assert.deepEqual(s.composition.value,Object.fromEntries(Object.entries(parseFormula(sp.formula).atoms).sort(([a],[b])=>a.localeCompare(b)))); assert.equal(s.composition.provenance,'FORMULA_PARSER'); }
  }
  assert.deepEqual(sub('species.h2so4').composition.value,{H:2,O:4,S:1});
  for(const f of ['src/features/chemistry-knowledge/passport.ts','src/features/chemistry-knowledge/explorer-render.ts']){
    const s=read(f);
    assert.ok(!/formula-parser|parseFormula|ionic-engine|IonicEngine/.test(s),`${f}: a renderer must not compute chemistry`);
    assert.ok(!/\[A-Z\]\[a-z\]/.test(s),`${f}: no element regex`);
  }
});

test('4. an unknown element or an unreadable formula fails closed',()=>{
  for(const t of ['Xx2','nacl','SO4 2-','','H2SO4'.repeat(10)]) assert.equal(resolveFormulaInput(domain.registry,t).status,'INVALID',t);
  assert.equal(resolveFormulaInput(domain.registry,'Xe').status,'NOT_FOUND');
  assert.deepEqual(resolveFormulaInput(domain.registry,'NaCl'),{status:'FOUND',speciesId:'species.nacl'});
  // a species "formula" that is a name: identity stays, composition / molar mass are gaps, nothing is made up
  for(const id of graph.unparsedSubstances){ assert.deepEqual(sub(id).composition,{status:'GAP',reason:'FORMULA_NOT_PARSEABLE'}); assert.equal(sub(id).relations.elements.length,0); }
  assert.ok(graph.unparsedSubstances.includes('species.kraxmal'));
  assert.throws(()=>explore(domain,['species.unknown'],{}),/EXPLORER_SPECIES_UNKNOWN/);
});

test('5. molar mass needs reviewed atomic masses — never a legacy or rounded value',()=>{
  assert.ok(index.substances.every(s=>s.molarMass.status==='GAP'));
  assert.equal(sub('species.nacl').molarMass.reason,'ATOMIC_MASS_NOT_REVIEWED');
  // fixture: reviewed (fixture) masses for Na and Cl unlock NaCl only, as an exact decimal sum
  const meta=(entries)=>({schema:'kimyolab.element-metadata.v1',rules:{periodGroup:{sourceRefs:[]}},entries});
  const entries={Na:{relativeAtomicMass:{value:10.5,sourceRefs:['src.test.accepted']}},Cl:{relativeAtomicMass:{value:20.25,sourceRefs:['src.test.accepted']}}};
  const decision=(sym,v)=>{ const a=elementAssertion(`metadata.${sym}.relativeAtomicMass`,'element-metadata',{symbol:sym,field:'relativeAtomicMass',value:v},['src.test.accepted']); return {assertionId:a.id,assertionHash:a.hash,decision:'approve',reviewerId:'Test Kimyogar',reviewerRole:'chemistry',reviewedAt:'2026-02-01T00:00:00.000Z'}; };
  const reviewed={schema:'kimyolab.element-reviews.v1',records:[decision('Na',10.5),decision('Cl',20.25)]};
  const {index:ix}=buildChemistryKnowledge(root,{sourceRegistry:FIX_REGISTRY,hub:{metadata:meta(entries),reviews:reviewed}});
  assert.deepEqual(ix.substances.find(s=>s.id==='species.nacl').molarMass,{status:'COMPUTED',value:'30.75',provenance:'REVIEWED_ATOMIC_MASSES'});
  assert.equal(ix.substances.find(s=>s.id==='species.naoh').molarMass.status,'GAP'); // O and H are not reviewed
  // an approval without the review register → still a gap
  const {index:unreviewed}=buildChemistryKnowledge(root,{sourceRegistry:FIX_REGISTRY,hub:{metadata:meta(entries)}});
  assert.equal(unreviewed.substances.find(s=>s.id==='species.nacl').molarMass.status,'GAP');
  assert.equal(decimalSum([{value:1.008,count:2},{value:15.999,count:1}]),'18.015');
  assert.equal(decimalSum([{value:0.1,count:3}]),'0.3');
  // the knowledge code never reads legacy masses
  assert.ok(!/data\/elements\.json/.test(read('scripts/lib/chemistry-knowledge.ts')));
});

test('6. dissociation unknown → "not modeled", never "does not dissociate"',()=>{
  const ie=IonicEngine.from({reactions:REACTIONS,rules:json('content-src/chemistry/solubility.json')});
  for(const s of index.substances){
    const f=SPECIES.find(x=>x.id===s.id).formula; const d=ie.dissociate(f);
    if(d.modeled) assert.deepEqual(s.dissociation,{status:'MODEL',value:d.ions,provenance:'CANONICAL_MODEL'});
    else assert.deepEqual(s.dissociation,{status:'GAP',reason:'DISSOCIATION_NOT_MODELED'});
  }
  assert.equal(LABELS['ui.substance-ions-not-modeled'],'Bu modda uchun ionlarga ajralish modeli hali mavjud emas.');
  for(const [k,v] of Object.entries(LABELS)) if(k.startsWith('ui.substance-')) assert.ok(!/dissotsilanmaydi|ajralmaydi|ionlanmaydi/.test(v),k);
});

// ------------------------------------------------------------------ the ReactionMatcher semantics

test('7. a modeled reaction comes from the matcher with its record',()=>{
  assert.deepEqual(explore(domain,['species.naoh','species.hcl'],{}),{kind:'MODELED_REACTION',reactionId:'rxn.naoh-hcl'});
  assert.deepEqual(explore(domain,['species.agno3','species.nabr'],{}),{kind:'MODELED_REACTION',reactionId:'rxn.agno3-nabr'});
  // every reaction record whose reactants resolve opens from its own explorer link and the matcher finds THAT record
  let reachable=0;
  for(const r of index.reactions){ const h=reactionExplorerHref(index,r.id,''); if(!h) continue; const st=parseExplorerQuery(new URL(`http://x${h}`).searchParams,index); const o=explore(domain,st.speciesIds,st.stated); assert.equal(o.kind,'MODELED_REACTION',r.id); assert.equal(o.reactionId,r.id); reachable++; }
  assert.equal(reachable,index.reactions.filter(r=>r.participants.reactants.every(Boolean)).length);
});

test('8. an explicit modeled no-reaction record is a separate outcome',()=>{
  // the repository has none (Cu + dilute HCl stays not modeled); a TEST-ONLY record exercises the mechanics
  assert.equal(REACTIONS.filter(r=>r.reactionType==='no-reaction').length,0);
  const fixture={id:'rxn.fixture.no-reaction',reactants:[{formula:'Cu'},{formula:'HCl'}],products:[],conditions:{},direction:'forward',reactionType:'no-reaction',molecularEquation:'Cu + HCl → (fixture)',observations:[{type:'no-visible-change'}],safety:[],curriculumRefs:[],sourceRefs:[{id:'src.beta1.migration',type:'internal',title:'fixture'}],version:'1.0.0'};
  const d={...domain,matcher:ReactionMatcher.from([...REACTIONS,fixture],{vocabulary})};
  assert.deepEqual(explore(d,['species.cu','species.hcl'],{}),{kind:'MODELED_NO_REACTION',reactionId:'rxn.fixture.no-reaction'});
  const {index:ix}=buildChemistryKnowledge(root,{reactions:[...REACTIONS,fixture]});
  const k=ix.reactions.find(r=>r.id==='rxn.fixture.no-reaction');
  assert.equal(k.ionicEquation.status,'GAP'); assert.equal(k.review,'MODEL_RECORD');
});

test('9. an unknown pair never becomes "no reaction"',()=>{
  assert.deepEqual(explore(domain,['species.cu','species.hcl'],{}),{kind:'NOT_MODELED'});
  let checked=0;
  for(let i=0;i<SPECIES.length;i+=7) for(let j=i+1;j<SPECIES.length;j+=5){
    const a=SPECIES[i], b=SPECIES[j];
    if(domain.matcher.candidates([{formula:a.formula,phase:a.phase},{formula:b.formula,phase:b.phase}]).length) continue;
    assert.deepEqual(explore(domain,[a.id,b.id],{}),{kind:'NOT_MODELED'}); checked++;
  }
  assert.ok(checked>50);
  assert.match(LABELS['ui.reactions-not-modeled'],/yetarli ma’lumot yo‘q/);
  assert.match(LABELS['ui.reactions-not-modeled-note'],/degani emas/);
});

test('10. a required condition is never assumed',()=>{
  // H2 + O2 needs ignition: not stated → the requirement is named; stated → the record
  assert.deepEqual(explore(domain,['species.h2','species.o2'],{}),{kind:'CONDITION_REQUIRED',requirements:[{ignition:'present'}]});
  assert.deepEqual(explore(domain,['species.h2','species.o2'],{ignition:'present'}),{kind:'MODELED_REACTION',reactionId:'rxn.h2-combustion'});
  // a stated value that conflicts is not met either
  assert.equal(explore(domain,['species.h2','species.o2'],{ignition:'absent'}).kind,'CONDITION_REQUIRED');
  // an unknown condition value in a link is refused, never applied
  const st=parseExplorerQuery(new URLSearchParams('r=h2&r=o2&c=ignition:sometimes&c=colour:blue&c=ignition'),index);
  assert.deepEqual(st.stated,{}); assert.equal(st.rejected.length,3);
  // an unknown tag on a record fails the build (fail closed)
  const bad=REACTIONS.map(r=>r.id==='rxn.h2-combustion'?{...r,conditions:{tags:['moonlight']}}:r);
  assert.throws(()=>buildChemistryKnowledge(root,{reactions:bad}),/REACTION_CONDITION_UNKNOWN:rxn.h2-combustion/);
});

test('11. a phase mismatch is not guessed',()=>{
  // rxn.agno3-nacl names NaCl(aq); the registry's NaCl is a solid → the explorer does not convert it
  assert.deepEqual(explore(domain,['species.agno3','species.nacl'],{}),{kind:'NOT_MODELED'});
  assert.equal(reactionExplorerHref(index,'rxn.agno3-nacl',''),null);
  assert.deepEqual(graph.unresolvedParticipants,[{reactionId:'rxn.agno3-nacl',formula:'NaCl',phase:'aq',reason:'PHASE_NOT_IN_REGISTRY'}]);
  assert.deepEqual(rxn('rxn.agno3-nacl').participants.reactants,['species.agno3',null]);
});

test('12. several candidate records require a condition',()=>{
  const o=explore(domain,['species.c','species.o2'],{ignition:'present'});
  assert.equal(o.kind,'CONDITION_REQUIRED');
  assert.deepEqual(o.requirements.map(r=>r['oxygen-supply']).sort(),['excess','limited']);
  assert.deepEqual(explore(domain,['species.c','species.o2'],{ignition:'present','oxygen-supply':'excess'}),{kind:'MODELED_REACTION',reactionId:'rxn.c-combustion'});
  assert.deepEqual(explore(domain,['species.c','species.o2'],{ignition:'present','oxygen-supply':'limited'}),{kind:'MODELED_REACTION',reactionId:'rxn.c-combustion-limited'});
  // TEST-ONLY: two records that both hold → the learner is asked, the system does not pick
  const twin={...REACTIONS.find(r=>r.id==='rxn.naoh-hcl'),id:'rxn.fixture.twin'};
  const d={...domain,matcher:ReactionMatcher.from([...REACTIONS,twin],{vocabulary})};
  assert.equal(explore(d,['species.naoh','species.hcl'],{}).kind,'CONDITION_CHOICE_REQUIRED');
});

test('13. no ionic equation is invented where IonicEngine does not support it',()=>{
  const ie=IonicEngine.from({reactions:REACTIONS,rules:json('content-src/chemistry/solubility.json')});
  for(const r of index.reactions){
    if(ie.support(r.id).supported) assert.deepEqual(r.ionicEquation,{status:'COMPUTED',value:ie.netIonicEquation(r.id).equation,provenance:'ENGINE_COMPUTED'});
    else assert.deepEqual(r.ionicEquation,{status:'GAP',reason:'IONIC_NOT_SUPPORTED'});
  }
  assert.equal(rxn('rxn.agno3-nabr').ionicEquation.status,'GAP');
  assert.equal(LABELS['ui.reactions-ionic-missing'],'Ionli tenglama modeli bu reaksiya uchun hali to‘liq emas.');
});

test('14. an observation comes only from the record (flagged ones wait for review)',()=>{
  for(const r of index.reactions){
    const rec=REACTIONS.find(x=>x.id===r.id); const g=governance.reactions.find(x=>x.id===r.id);
    if(g.observationFlags.includes('CHEMISTRY_REVIEW_REQUIRED')) assert.deepEqual(r.observations,{status:'GAP',reason:'OBSERVATION_REVIEW_REQUIRED'});
    else assert.deepEqual(r.observations,{status:'MODEL',value:rec.observations,provenance:'CANONICAL_MODEL'});
  }
  // the renderer names no colour, gas or heat effect of its own (colour names come from the record via the catalog)
  const render=read('src/features/chemistry-knowledge/passport.ts')+read('src/features/chemistry-knowledge/explorer-render.ts');
  assert.ok(!/['"](white|yellow|black|blue|oq|sariq|qora|H2|CO2|O2)['"]/.test(render));
});

// ------------------------------------------------------------------ one canonical graph

test('15. every relation rests on a canonical chain — no keyword or title matching',()=>{
  const stepMap=json('content-src/chemistry/guided-step-reaction-map.json');
  const mappings=json('content-src/mapping-links.json');
  const stepHas=(lab,rid)=>Object.values(stepMap[lab]??{}).flat().includes(rid);
  for(const s of index.substances){
    for(const l of s.relations.labs) for(const v of l.via){
      if(v==='topic-lab-profile:shelf') assert.ok(graph.labSpecies.get(l.id)?.has(s.id),`${s.id} shelf ${l.id}`);
      else { assert.ok(s.relations.reactions.includes(v),`${s.id} via ${v}`); assert.ok(stepHas(l.id,v),`${l.id} ${v}`); }
    }
    for(const t of s.relations.topics) for(const lab of t.via) assert.ok(mappings.some(m=>m.practiceActivityId===lab&&m.learningUnitId===t.id));
  }
  for(const r of index.reactions) for(const l of r.relations.labs) assert.ok(stepHas(l.id,r.id));
  const code=read('scripts/lib/chemistry-graph.ts')+read('scripts/lib/chemistry-knowledge.ts');
  assert.ok(!/\.title\b[^;]*(includes|match|indexOf|test)\(/.test(code),'no title matching');
  assert.ok(!/toLowerCase|toLocaleLowerCase|RegExp\(/.test(code),'no text matching');
});

test('16. participation never becomes PRIMARY',()=>{
  assert.ok(!JSON.stringify(index).includes('PRIMARY'));
  assert.deepEqual(Object.values(RELATION_PROVENANCE.substance).sort(),['DERIVED_FROM_FORMULA','EXPLICIT_MAPPING','EXPLICIT_MAPPING','REACTION_PARTICIPANT']);
  const rel=JSON.parse(knowledgeOutputs(root)[KNOWLEDGE_REPORTS.relations]);
  assert.equal(rel.counts.primary,0);
});

test('17–18. element ↔ substance backlinks agree in both directions (Element Hub = knowledge index)',()=>{
  const {hub}=buildElementHub(root);
  for(const e of hub.elements) for(const r of e.relations.substances) assert.ok(sub(r.id).relations.elements.includes(e.symbol),`${e.symbol} → ${r.id}`);
  for(const s of index.substances) for(const sym of s.relations.elements) assert.ok(hub.elements.find(e=>e.symbol===sym).relations.substances.some(r=>r.id===s.id),`${s.id} → ${sym}`);
  // the element profile's reaction list matches the knowledge index's element links of reactions
  for(const r of index.reactions) for(const sym of r.relations.elements) assert.ok(hub.elements.find(e=>e.symbol===sym).relations.reactions.some(x=>x.id===r.id));
  // the periodic feature receives link builders; it never imports this feature
  assert.ok(!/chemistry-knowledge/.test(read('src/features/periodic/render.ts')+read('src/features/periodic/model.ts')+read('src/features/periodic/hub.ts')));
});

// ------------------------------------------------------------------ routes, flags, search

test('19–20. /substance/<key> and /reactions deep links; server allow-list',()=>{
  assert.deepEqual(parseAppRoute('/substance/h2so4'),{name:'substance',key:'h2so4'});
  assert.deepEqual(parseAppRoute('/substance/so4_2minus'),{name:'substance',key:'so4_2minus'});
  assert.deepEqual(parseAppRoute('/reactions'),{name:'reactions'});
  assert.equal(parseAppRoute('/substance/').name,'not-found');
  const server=read('server/app.mjs');
  assert.match(server,/'\/reactions'/); assert.match(server,/'\/substance\/'/);
  // explorer link round trip
  const h=explorerHref(['species.agno3','species.nabr'],{temperature:'room'},'?ff=reactionExplorerV1');
  assert.equal(h,'/reactions?ff=reactionExplorerV1&r=agno3&r=nabr&c=temperature%3Aroom');
  assert.deepEqual(parseExplorerQuery(new URL(`http://x${h}`).searchParams,index),{speciesIds:['species.agno3','species.nabr'],stated:{temperature:'room'},rejected:[]});
  const many=parseExplorerQuery(new URLSearchParams(['agno3','nabr','hcl','naoh','h2o','agno3'].map(k=>`r=${k}`).join('&')),index);
  assert.equal(many.speciesIds.length,MAX_REAGENTS); assert.equal(many.rejected.length,2);
});

test('23. global search: substances (formula exact, name) and reactions (formulas) in the existing search',()=>{
  const localize=(k)=>json('content-src/locales/uz-latn/chemistry-species.json').names[k]??null;
  const entries=[...substanceSearchEntries(index,domain.registry,localize,{kicker:'Modda',description:p=>p},''),...reactionSearchEntries(index,domain.reactions,{kicker:'Reaksiya',description:t=>t},'')];
  assert.equal(searchStudentContent('NaCl',entries)[0].title,'natriy xlorid (NaCl)');
  assert.equal(searchStudentContent('kumush nitrat',entries)[0].href,'/substance/agno3');
  const agbr=searchStudentContent('AgBr',entries);
  assert.equal(agbr[0].kind,'substance'); assert.ok(agbr.some(r=>r.kind==='reaction'&&r.href.startsWith('/reactions?')));
  // a reaction without an explorer link (unresolved reactant) has no entry; no reaction href names a record id
  assert.ok(entries.filter(e=>e.kind==='reaction').every(e=>!/rxn\./.test(e.href)));
  assert.equal(entries.filter(e=>e.kind==='reaction').length,index.reactions.length-1);
  assert.match(read('src/features/search/model.ts'),/entry\.kind==='substance'\|\|entry\.kind==='reaction'/);
});

test('24. flags default off; with a flag off the route does not exist and nothing else changes',()=>{
  for(const f of ['substancePassportV1','reactionExplorerV1']){
    assert.equal(FEATURE_FLAGS[f].default,false);
    assert.equal(isFeatureEnabled(f,new URLSearchParams('')),false);
    assert.equal(isFeatureEnabled(f,new URLSearchParams(`ff=${f}`)),true);
  }
  const boot=read('src/app/bootstrap.ts');
  assert.match(boot,/route\.name==='substance'[\s\S]*?if\(!isFeatureEnabled\('substancePassportV1',active\.searchParams\)\)\{renderNotFound\(main\);return;\}/);
  assert.match(boot,/route\.name==='reactions'[\s\S]*?if\(!isFeatureEnabled\('reactionExplorerV1',active\.searchParams\)\)\{renderNotFound\(main\);return;\}/);
  // isolation: no other learner feature (curriculum, practice, dynamic lab, periodic, textbook excerpt) and no Studio
  // module imports this feature; it writes no progress
  const offenders=[];
  const walk=(dir)=>{ for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){ const rel=`${dir}/${e.name}`; if(e.isDirectory()) walk(rel); else if(/\.ts$/.test(e.name)&&!rel.startsWith('src/features/chemistry-knowledge/')&&rel!=='src/app/bootstrap.ts'&&rel!=='src/app/content-client.ts'&&/chemistry-knowledge\//.test(read(rel))) offenders.push(rel); } };
  walk('src');
  assert.deepEqual(offenders,[]);
  for(const f of fs.readdirSync(path.join(root,'src/features/chemistry-knowledge'))) assert.ok(!/progress|indexedDB|evidence|attempt/i.test(read(`src/features/chemistry-knowledge/${f}`).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'')),f);
});

// ------------------------------------------------------------------ governance

test('28. a governance edit makes a reaction review stale',()=>{
  const reactions=withSource('rxn.naoh-hcl','src.test.accepted');
  const first=buildChemistryKnowledge(root,{reactions,sourceRegistry:FIX_REGISTRY});
  const g=first.governance.reactions.find(x=>x.id==='rxn.naoh-hcl');
  assert.equal(g.source,'SOURCE_ELIGIBLE'); assert.equal(g.review,'pending'); assert.equal(first.index.reactions.find(r=>r.id==='rxn.naoh-hcl').review,'MODEL_RECORD');
  const reviews=CHEM([APPROVE(g)]);
  const approved=buildChemistryKnowledge(root,{reactions,sourceRegistry:FIX_REGISTRY,chemistryReviews:reviews});
  assert.equal(approved.index.reactions.find(r=>r.id==='rxn.naoh-hcl').review,'REVIEWED');
  // the claim changes after the decision → stale; the learner sees a model record again
  const edited=reactions.map(r=>r.id==='rxn.naoh-hcl'?{...r,direction:'reversible'}:r);
  const after=buildChemistryKnowledge(root,{reactions:edited,sourceRegistry:FIX_REGISTRY,chemistryReviews:reviews});
  assert.equal(after.governance.reactions.find(x=>x.id==='rxn.naoh-hcl').review,'stale');
  assert.equal(after.index.reactions.find(r=>r.id==='rxn.naoh-hcl').review,'MODEL_RECORD');
  // the repository: 28 model records, none reviewed, no decision fabricated
  assert.equal(json('content-src/chemistry-reviews.json').records.length,0);
  assert.equal(index.reactions.filter(r=>r.review==='REVIEWED').length,0);
});

test('29. automation cannot approve (the register fails closed)',()=>{
  const g=buildChemistryKnowledge(root,{sourceRegistry:FIX_REGISTRY,reactions:withSource('rxn.naoh-hcl','src.test.accepted')}).governance.reactions.find(x=>x.id==='rxn.naoh-hcl');
  for(const who of ['claude','kimyolab-bot','github-actions','automation']) assert.throws(()=>buildChemistryKnowledge(root,{sourceRegistry:FIX_REGISTRY,reactions:withSource('rxn.naoh-hcl','src.test.accepted'),chemistryReviews:CHEM([APPROVE(g,{reviewerId:who})])}),/CHEM_REVIEW_REVIEWER_NOT_HUMAN/,who);
  assert.throws(()=>buildChemistryKnowledge(root,{chemistryReviews:CHEM([{...APPROVE(g),status:'approved'}])}),/CHEM_REVIEW_FIELD_NOT_ALLOWED/);
});

test('30. an unknown source never becomes accepted',()=>{
  const reactions=withSource('rxn.naoh-hcl','src.not-in-registry');
  const g=buildChemistryKnowledge(root,{reactions}).governance.reactions.find(x=>x.id==='rxn.naoh-hcl');
  assert.equal(g.source,'SOURCE_REQUIRED');
  const approved=buildChemistryKnowledge(root,{reactions,chemistryReviews:CHEM([APPROVE(g)])});
  assert.equal(approved.governance.reactions.find(x=>x.id==='rxn.naoh-hcl').review,'approved');
  assert.equal(approved.index.reactions.find(r=>r.id==='rxn.naoh-hcl').review,'MODEL_RECORD'); // approval without an eligible source does not count
  // legacy object-form refs keep only their id; the registry decides the rest
  assert.deepEqual(refIds([{id:'src.beta1.migration',type:'internal',title:'anything'},'src.x',{title:'no id'}]),['src.beta1.migration','src.x']);
  // the repository's species / reaction sources are registered but not eligible (INTERNAL_PROPOSAL, PROPOSED)
  assert.ok(governance.reactions.every(r=>r.source==='SOURCE_NOT_ELIGIBLE'));
  assert.ok(index.substances.every(s=>s.hazards.status==='GAP'&&s.properties.status==='GAP'));
});

// ------------------------------------------------------------------ catalog, bundle, reports, formal metrics

test('catalog: every condition, reaction type, safety note, phase and hazard has natural Uzbek text; no ids leak',()=>{
  for(const c of index.conditions){ assert.ok(LABELS[`ui.reactions-dim-${c.dimension}`],c.dimension); for(const v of c.values) assert.ok(LABELS[`ui.reactions-val-${c.dimension}-${v}`],`${c.dimension}:${v}`); }
  for(const t of new Set([...REACTIONS.map(r=>r.reactionType),'no-reaction'])) assert.ok(LABELS[`ui.reactions-type-${t}`],t);
  for(const s of new Set(REACTIONS.flatMap(r=>r.safety))) assert.ok(LABELS[`ui.reactions-safety-${s.replace(/\s+/g,'-')}`],s);
  for(const p of new Set(SPECIES.map(s=>s.phase))) assert.ok(LABELS[`ui.substance-phase-${p}`],p);
  for(const h of new Set(SPECIES.flatMap(s=>s.hazards))) assert.ok(LABELS[`ui.substance-hazard-${h}`],h);
  for(const [k,v] of Object.entries(LABELS)) if(/^ui\.(substance|reactions|knowledge)-/.test(k)) assert.ok(!/species\.|rxn\.|Matcher|Engine|MODEL_|SOURCE_|GAP|hash/i.test(v),k);
  // every catalog key the pages use exists
  const code=read('src/features/chemistry-knowledge/passport.ts')+read('src/features/chemistry-knowledge/explorer-render.ts')+read('src/app/bootstrap.ts');
  for(const m of code.matchAll(/'(ui\.(?:substance|reactions|knowledge)-[a-z0-9-]+[a-z0-9])'/g)) assert.ok(m[1] in LABELS,m[1]);
});

test('bundle: the P2.14 phase is measured (P2.13 is now a recorded constant); the index is compact and browser-local',async()=>{
  const {bundleDelta,P213_BUNDLE_DELTA}=await import('../scripts/guided-dynamic-lab.ts');
  const b=bundleDelta(root,{learnerModules:0,learnerModuleBytes:0,standaloneBytes:0});
  assert.deepEqual(b.phases['P2.13'],P213_BUNDLE_DELTA);
  assert.ok('P2.14' in b.phases);
  const r=JSON.parse(knowledgeOutputs(root)[KNOWLEDGE_REPORTS.readiness]);
  assert.ok(r.performance.knowledgeIndex.bytes<120000,'no huge duplicate dataset');
  assert.equal(index.schema,CHEMISTRY_KNOWLEDGE_SCHEMA);
  // identity and records are not duplicated into the index
  assert.ok(index.substances.every(x=>!('formula' in x)&&!('nameKey' in x)&&!('phase' in x)));
  assert.ok(index.reactions.every(x=>!('molecularEquation' in x)&&!('reactants' in x)&&!('products' in x)));
  assert.match(read('scripts/build-content-pack.ts'),/buildChemistryKnowledge\(root\)\.index/);
});

test('reports: generator-equal; dimensions separate (no merged percentage); formal metrics unchanged',()=>{
  const out=knowledgeOutputs(root);
  for(const [rel,body] of Object.entries(out)) assert.equal(read(rel),body,`${rel} is stale (npm run knowledge:report)`);
  const all=Object.values(out).join('\n');
  assert.ok(!/"(completion|completionPercent|coverage)Percent"|"percent"\s*:/.test(all.replace(/"formalMetrics"[\s\S]*?\}/g,'')),'no merged completion %');
  const r=JSON.parse(out[KNOWLEDGE_REPORTS.readiness]);
  const p=json('reports/project-progress.json');
  assert.equal(r.formalMetrics.learningProduct,p.learningProductProgress.percent);
  assert.equal(r.formalMetrics.overall,p.overallManagementEstimate.percent);
  assert.equal(p.learningProductProgress.percent,12.189); assert.equal(p.overallManagementEstimate.percent,47.313);
  const inv=JSON.parse(out[KNOWLEDGE_REPORTS.inventory]);
  assert.equal(inv.species.total,SPECIES.length); assert.equal(inv.reactions.total,REACTIONS.length);
  const ex=JSON.parse(out[KNOWLEDGE_REPORTS.explorer]);
  assert.equal(ex.pairsOfCanonicalSpecies.modeledNoReaction,0); assert.equal(ex.reachability.unreachable.length,1);
});
