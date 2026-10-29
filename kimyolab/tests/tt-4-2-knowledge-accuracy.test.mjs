// TT 4.2 — canonical chemistry knowledge base and scientific accuracy (machine-checkable parts only). The expert
// decisions themselves (28 reaction reviews, NaCl(aq), the hazard claims) are human work; these tests pin that the
// machine never makes them and never shows an unreviewed claim as reviewed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSourceRegistry,sourceAcceptance,canonicalSourceIssues,missingBibliography,BIBLIOGRAPHY_FIELDS} from '../src/domain/governance/source-policy.ts';
import {validateSourceIntake} from '../src/authoring/source-intake.ts';
import {ReactionMatcher} from '../src/domain/chemistry/reaction-matcher.ts';
import {SpeciesRegistry} from '../src/domain/chemistry/species-registry.ts';
import {parseConditionVocabulary} from '../src/domain/chemistry/condition-vocabulary.ts';
import {explore,reviewedReactionIdsOf} from '../src/features/chemistry-knowledge/explorer.ts';
import {buildChemistryKnowledge} from '../scripts/lib/chemistry-knowledge.ts';
import {expertPacket,expertPacketOutputs,reactionChecks,parseMolecularEquation,EXPERT_PACKET_REPORT,EXPERT_PACKET_DOC} from '../scripts/chemistry-expert-packet.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const json=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const COMPLETE={id:'src.x',category:'TEXTBOOK',title:'Fixture textbook',classification:'HUMAN_ACCEPTED',acceptedBy:'fixture.person',acceptedAt:'2026-10-01T00:00:00Z',reviewedHash:'a'.repeat(64),
  authority:'Fixture publisher',edition:'2',bibliographic:{authors:['Fixture Author'],isbn:'fixture-isbn'},license:'fixture-licence',effectiveDate:'2026-09-01'};
const entry=(over={},drop=[])=>{ const raw={...COMPLETE,...over}; for(const k of drop) delete raw[k]; return parseSourceRegistry({schema:'kimyolab.source-registry.v1',sources:[raw]}).registry.byId.get('src.x'); };

test('4.2.4 a source needs complete bibliography before it can back a canonical claim',()=>{
  assert.deepEqual(sourceAcceptance(entry()),{registered:true,categoryCompatible:true,humanAccepted:true,bibliographicComplete:true,bibliographyMissing:[],canonicalAuthoringEligible:true});
  const cases=[[{},['authority'],'authority'],[{},['edition'],'edition'],[{bibliographic:{isbn:'x'}},[],'authors'],[{bibliographic:{authors:['A']}},[],'isbnOrUrl'],
    [{},['license'],'license'],[{},['effectiveDate'],'effectiveDate'],[{effectiveDate:'not a date'},[],'effectiveDate'],[{title:'  '},[],'title']];
  for(const [over,drop,field] of cases){
    const e=entry(over,drop); const a=sourceAcceptance(e);
    assert.equal(a.humanAccepted,true,field); assert.equal(a.canonicalAuthoringEligible,false,field); assert.ok(a.bibliographyMissing.includes(field),field);
  }
  // a URL or an identifier is as good as an ISBN; nothing else is
  for(const b of [{authors:['A'],url:'https://example.invalid/book'},{authors:['A'],identifier:'doc-1'}]) assert.equal(sourceAcceptance(entry({bibliographic:b})).canonicalAuthoringEligible,true);
  const reg=parseSourceRegistry({schema:'kimyolab.source-registry.v1',sources:[{...COMPLETE,license:undefined}]}).registry;
  assert.deepEqual(canonicalSourceIssues(['src.x'],reg),[{ref:'src.x',code:'SOURCE_BIBLIOGRAPHY_INCOMPLETE'}]);
  assert.deepEqual(missingBibliography(undefined),[...BIBLIOGRAPHY_FIELDS]);
});

test('4.2.4 the registry holds no eligible source: every legacy record lacks its bibliography (nothing is filled in)',()=>{
  const {registry}=parseSourceRegistry(json('content-src/source-registry.json'));
  assert.equal(registry.byId.size,5);
  for(const e of registry.byId.values()){ const a=sourceAcceptance(e); assert.equal(a.canonicalAuthoringEligible,false,e.id); assert.equal(a.bibliographicComplete,false,e.id); }
  // so molar mass stays unknown: no substance shows one
  const {index}=buildChemistryKnowledge(root);
  assert.equal(index.substances.filter(s=>s.molarMass.status!=='GAP').length,0);
});

test('4.2.4 intake: license / effectiveDate are validated, never required while drafting',()=>{
  const base={schema:'kimyolab.source-intake.v1',sourceId:'src.fixture.a',category:'TEXTBOOK',title:'Fixture',authority:'Fixture publisher',language:'uz-Latn',bibliographic:{},locator:{kind:'page'},submittedBy:'fixture.submitter',status:'draft',reviews:[]};
  assert.deepEqual(validateSourceIntake(base),[]);
  assert.deepEqual(validateSourceIntake({...base,license:'fixture-licence',effectiveDate:'2026-09-01'}),[]);
  for(const effectiveDate of ['2026-9-1','yesterday','2026-13-40']) assert.ok(validateSourceIntake({...base,effectiveDate}).some(i=>i.code==='SCHEMA'&&i.where==='effectiveDate'),effectiveDate);
  assert.ok(validateSourceIntake({...base,license:'TODO'}).some(i=>i.code==='PLACEHOLDER_TEXT'));
  const schema=json('schemas/source-intake.schema.json');
  assert.ok(schema.properties.license&&schema.properties.effectiveDate); assert.ok(!schema.required.includes('license')&&!schema.required.includes('effectiveDate'));
});

test('4.2.6 a no-reaction claim is shown only for a REVIEWED record',()=>{
  const species=json('content-src/chemistry/species.json'), reactions=json('content-src/chemistry/reactions.json');
  const vocabulary=parseConditionVocabulary(json('content-src/chemistry/condition-vocabulary.json'));
  const fixture={id:'rxn.fixture.no-reaction',reactants:[{formula:'Cu'},{formula:'HCl'}],products:[],conditions:{},direction:'forward',reactionType:'no-reaction',molecularEquation:'Cu + HCl → (fixture)',observations:[{type:'no-visible-change'}],safety:[],curriculumRefs:[],sourceRefs:[{id:'src.beta1.migration',type:'internal',title:'fixture'}],version:'1.0.0'};
  const d={matcher:ReactionMatcher.from([...reactions,fixture],{vocabulary}),registry:SpeciesRegistry.from(species),vocabulary};
  const {index}=buildChemistryKnowledge(root,{reactions:[...reactions,fixture]});
  const reviewed=reviewedReactionIdsOf(index);
  assert.equal(reviewed.size,0,'nothing is reviewed today');
  assert.equal(explore({...d,reviewedReactionIds:reviewed},['species.cu','species.hcl'],{}).kind,'NO_REACTION_NOT_REVIEWED');
  assert.equal(explore(d,['species.cu','species.hcl'],{}).kind,'NO_REACTION_NOT_REVIEWED','no review set = fail closed');
  // the reviewed set comes ONLY from the knowledge index's REVIEWED flag
  assert.deepEqual([...reviewedReactionIdsOf({reactions:[{id:'a',review:'REVIEWED'},{id:'b',review:'MODEL_RECORD'}]})],['a']);
  // the learner copy for the unreviewed case exists and does not claim "does not react" as a fact
  const ui=json('content-src/locales/uz-latn/learner-interaction.json');
  const text=JSON.stringify(ui); assert.ok(text.includes('ui.reactions-no-reaction-unreviewed')&&text.includes('ui.reactions-announce-no-reaction-unreviewed'));
});

test('4.2.3 machine checks: atom/charge conservation and the canonical balancer, reported never repaired',()=>{
  assert.deepEqual(parseMolecularEquation('2H2 + O2 → 2H2O'),{reactants:[{coefficient:2,formula:'H2'},{coefficient:1,formula:'O2'}],products:[{coefficient:2,formula:'H2O'}],arrow:'→'});
  const ok=reactionChecks({molecularEquation:'2H2 + O2 → 2H2O',reactants:[{formula:'H2'},{formula:'O2'}],products:[{formula:'H2O'}],direction:'forward'});
  assert.equal(ok.atomBalance,'BALANCED'); assert.equal(ok.balancer.status,'AGREES'); assert.equal(ok.arrowMatchesDirection,true);
  const bad=reactionChecks({molecularEquation:'H2 + O2 → H2O',reactants:[{formula:'H2'},{formula:'O2'}],products:[{formula:'H2O'}],direction:'reversible'});
  assert.equal(bad.atomBalance,'UNBALANCED'); assert.equal(bad.balancer.status,'DIFFERS'); assert.equal(bad.arrowMatchesDirection,false);
  const mismatch=reactionChecks({molecularEquation:'2H2 + O2 → 2H2O',reactants:[{formula:'H2'},{formula:'Cl2'}],products:[{formula:'H2O'}],direction:'forward'});
  assert.equal(mismatch.formulasMatchRecord,false);
  assert.equal(reactionChecks({molecularEquation:'no arrow here',reactants:[],products:[]}).equationParse,'EQUATION_NOT_PARSEABLE');
});

test('4.2 expert packet: every item PENDING; nothing unreviewed shown as reviewed; the agent chooses nothing',()=>{
  const p=expertPacket(root);
  assert.equal(p.reactions.length,28);
  assert.equal(p.summary.atomBalanced,28); assert.equal(p.summary.balancerAgrees,28); assert.equal(p.summary.speciesResolved,27);
  assert.deepEqual(p.speciesIdentity.issues,[],'SpeciesRegistry identity invariants hold');
  assert.doesNotThrow(()=>SpeciesRegistry.from(json('content-src/chemistry/species.json')));
  for(const r of p.reactions){
    assert.ok(r.decisions.length>=2,r.id);
    for(const d of r.decisions){ assert.equal(d.expertDecision,'PENDING'); assert.match(d.assertionHash,/^[a-f0-9]{64}$/); assert.notEqual(d.currentReview,'approved'); }
    assert.equal(r.knowledgeIndexReview,'MODEL_RECORD');
    assert.equal(r.machineChecks.conditionVerdict,'CONTRACT_OK',r.id);
  }
  assert.equal(p.summary.decisionsToMake,28+11+28,'28 reaction + 11 condition + 28 observation claims');
  assert.deepEqual(p.acceptance.shownReviewedWithoutApproval,[]);
  assert.match(p.acceptance.status,/^NOT_MET/,'PENDING never counts as PASS');
  assert.equal(p.naclDecision.machineRecommendation,null); assert.equal(p.naclDecision.expertDecision,'PENDING'); assert.equal(p.naclDecision.options.length,3);
  assert.deepEqual(p.naclDecision.finding.map(f=>f.reason),['PHASE_NOT_IN_REGISTRY']);
  const hazardous=json('content-src/chemistry/species.json').filter(s=>(s.hazards??[]).length);
  assert.equal(p.hazards.species.length,hazardous.length); assert.equal(p.hazards.species.length,39);
  assert.ok(p.hazards.species.every(h=>h.expertDecision==='PENDING'&&h.sources.every(s=>!s.canonicalAuthoringEligible)));
});

test('4.2 expert packet files are generator-equal',()=>{
  for(const [rel,body] of Object.entries(expertPacketOutputs(root))) assert.equal(fs.readFileSync(path.join(root,rel),'utf8'),body,`${rel} is stale: npm run chemistry:expert-packet`);
  assert.deepEqual(Object.keys(expertPacketOutputs(root)).sort(),[EXPERT_PACKET_DOC,EXPERT_PACKET_REPORT].sort());
});
