// P1.7 — chemistry knowledge-base hardening: inventory/coverage reports, the condition vocabulary, matcher
// determinism / order / condition properties, IonicEngine balance and fail-closed properties, the FAIL vs PENDING
// gate, the human-only review workflow with hash-based stale invalidation, ionic 21-pair classification,
// localization (nameKey), electrolysis readiness, pilot impact. Nothing here adds chemistry truth.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildKbReports,loadKb,buildAssertions,evaluateGate,REPORTS,PACKET_DIR,REVIEW_REGISTER_FILE} from '../scripts/lib/chemistry-kb.ts';
import {buildPacket} from '../scripts/chemistry-kb.ts';
import {importDecisions} from '../scripts/chemistry-review/import.ts';
import {ReactionMatcher,classifyMatch} from '../src/domain/chemistry/reaction-matcher.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {parseIonicEquation} from '../src/domain/chemistry/ionic-equation.ts';
import {parseConditionVocabulary,dimensionsOf} from '../src/domain/chemistry/condition-vocabulary.ts';
import {reviewStateOf,assertionHash} from '../src/domain/chemistry/kb-review.ts';
import {createLocalizer,parseSpeciesNameCatalog} from '../src/features/localization/element-names.ts';
import {toIonicPrecipitationRendererModel} from '../src/renderers/ionic-precipitation/renderer-model.ts';
import {ionicIntent} from '../src/renderers/ionic-precipitation/renderer.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {memoryPackFetch} from './helpers/memory-pack.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const REACTIONS=read('content-src/chemistry/reactions.json'), RULES=read('content-src/chemistry/solubility.json');
const VOCAB=parseConditionVocabulary(read('content-src/chemistry/condition-vocabulary.json'));
const MIXING={dimensions:{...VOCAB.contexts['solution-mixing'].dimensions}};
const matcher=ReactionMatcher.from(REACTIONS,{vocabulary:VOCAB});
const tempRoot=()=>{ const t=fs.mkdtempSync(path.join(os.tmpdir(),'kl-kb-')); fs.cpSync(path.join(root,'content-src'),path.join(t,'content-src'),{recursive:true}); return t; };
const gateOf=(mutate)=>{ const kb=structuredClone(loadKb(root)); mutate(kb); return evaluateGate(kb,buildAssertions(kb)); };

// ------------------------------------------------------------------ reports

test('reports are deterministic, counted from content (never hardcoded), and the KB is valid (gate PENDING, 0 FAIL)',()=>{
  const r=buildKbReports(root);
  assert.deepEqual(read(REPORTS.inventory),r.inventory,'run npm run chemistry:kb');
  assert.deepEqual(read(REPORTS.coverage),r.coverage);
  assert.deepEqual(read(REPORTS.ionic),r.ionic);
  assert.deepEqual(read(REPORTS.electrolysis),r.electrolysis);
  const c=r.inventory.counts;
  assert.deepEqual([c.species,c.reactions,c.solubilityRecords.dissociation,c.solubilityRecords.insoluble,c.hydrolysisSalts,c.electrolysisRecords],
    [read('content-src/chemistry/species.json').length,REACTIONS.length,RULES.dissociation.length,RULES.insoluble.length,read('content-src/chemistry/hydrolysis.json').records.length,read('content-src/chemistry/electrolysis.json').records.length]);
  assert.equal(c.conditionedReactions,REACTIONS.filter(x=>(x.conditions.tags??[]).length).length);
  assert.equal(c.explicitNoReactionRecords,0,'KNOWN CONTENT GAP');
  assert.equal(c.reviewed,0,'nothing is approved by tooling');
  assert.equal(c.assertions,c.pending+c.reviewed+c.rejected+c.stale);
  assert.equal(r.gate.status,'PENDING'); assert.deepEqual(r.gate.fail,[]);
  for(const row of r.inventory.reactions) for(const k of ['reactionId','reactants','products','reactionType','conditions','observation','netIonicDerivable','sourceRefs','reviewStatus','usedByActivities']) assert.ok(k in row,k);
  const packet=buildPacket(r);
  assert.deepEqual(read(`${PACKET_DIR}/assertions.json`).assertions,packet.assertions);
  assert.deepEqual(read(`${PACKET_DIR}/candidates.json`).candidates,packet.candidates);
});

// ------------------------------------------------------------------ conditions

test('condition vocabulary: every KB tag has a structured meaning; meaning, not spelling, decides',()=>{
  for(const r of REACTIONS){ const d=dimensionsOf(r.conditions.tags??[],VOCAB); assert.deepEqual([d.unknown,d.conflicts],[[],[]],r.id); }
  // "dilute acid" is met by mixing school solutions; "concentrated acid + gentle heating" is not
  const zn=matcher.match({reactants:['Zn','H2SO4'],conditions:MIXING,conditionPolicy:'require-record-conditions'});
  assert.equal(zn.modeled&&zn.reaction.id,'rxn.zn-h2so4');
  assert.deepEqual(matcher.match({reactants:['NaCl','H2SO4'],conditions:MIXING,conditionPolicy:'require-record-conditions'}),{modeled:false,code:'REACTION_CONDITIONS_NOT_MET'});
  // an unknown record tag is never guessed: the requirement fails, and the gate FAILs
  const odd=[...REACTIONS.filter(r=>r.id!=='rxn.zn-h2so4'),{...REACTIONS.find(r=>r.id==='rxn.zn-h2so4'),conditions:{tags:['moonlight']}}];
  assert.deepEqual(ReactionMatcher.from(odd,{vocabulary:VOCAB}).match({reactants:['Zn','H2SO4'],conditions:MIXING,conditionPolicy:'require-record-conditions'}),{modeled:false,code:'REACTION_CONDITIONS_NOT_MET'});
  assert.ok(gateOf(kb=>{kb.reactions.find(r=>r.id==='rxn.zn-h2so4').conditions.tags=['moonlight'];}).fail.some(f=>f.startsWith('CONDITION_TAG_UNKNOWN:rxn.zn-h2so4')));
  assert.ok(gateOf(kb=>{kb.reactions.find(r=>r.id==='rxn.zn-h2so4').conditions.tags=['heating','strong heating'];}).fail.some(f=>f.startsWith('CONDITION_TAG_CONFLICT')));
});

test('property: required conditions — a conditioned record never matches a context missing any of its dimensions',()=>{
  const contexts=[{},MIXING,...Object.values(VOCAB.terms).map(t=>({dimensions:{[t.dimension]:t.value}}))];
  for(const r of REACTIONS.filter(x=>(x.conditions.tags??[]).length)){
    const need=dimensionsOf(r.conditions.tags,VOCAB).dimensions;
    for(const ctx of contexts){
      const m=matcher.match({reactants:r.reactants.map(x=>x.formula),conditions:ctx,conditionPolicy:'require-record-conditions'});
      const satisfied=Object.entries(need).every(([d,v])=>ctx.dimensions?.[d]===v);
      if(!satisfied) assert.ok(!m.modeled||m.reaction.id!==r.id,`${r.id} matched without ${JSON.stringify(need)} in ${JSON.stringify(ctx)}`);
    }
    const own=matcher.match({reactants:r.reactants.map(x=>x.formula),conditions:{dimensions:need},conditionPolicy:'require-record-conditions'});
    assert.equal(own.modeled&&own.reaction.id,r.id,`${r.id} under its own conditions`);
  }
});

test('property: determinism and order invariance — every reactant pair in every context gives 0 or 1 canonical match',()=>{
  const formulas=[...new Set(REACTIONS.flatMap(r=>r.reactants.map(x=>x.formula)))];
  const contexts=[{},MIXING,...REACTIONS.map(r=>({dimensions:dimensionsOf(r.conditions.tags??[],VOCAB).dimensions}))];
  let checked=0;
  for(let i=0;i<formulas.length;i++) for(let j=i;j<formulas.length;j++) for(const ctx of contexts){
    const q=(a,b)=>matcher.match({reactants:[a,b],conditions:ctx,conditionPolicy:'require-record-conditions'});
    const ab=q(formulas[i],formulas[j]), ba=q(formulas[j],formulas[i]);
    assert.deepEqual(ab,ba,`order: ${formulas[i]}+${formulas[j]}`);
    assert.notEqual(ab.code,'REACTION_CONDITION_REQUIRED',`ambiguous: ${formulas[i]}+${formulas[j]} in ${JSON.stringify(ctx)}`);
    if(ab.modeled) assert.equal(REACTIONS.filter(r=>r.id===ab.reaction.id).length,1);
    checked++;
  }
  assert.ok(checked>1000,`${checked} checks`);
});

// ------------------------------------------------------------------ IonicEngine

test('IonicEngine: derivable equations are deterministic and atom- and charge-balanced; the rest fail closed (no guessing)',()=>{
  const e=IonicEngine.from({reactions:REACTIONS,rules:RULES});
  let derived=0;
  const side=(terms)=>{ const atoms={}; let charge=0; for(const t of terms){ const p=parseFormula(t.formula); for(const [el,n] of Object.entries(p.atoms)) atoms[el]=(atoms[el]??0)+n*t.coefficient; charge+=t.charge*t.coefficient; } return {atoms,charge}; };
  for(const r of REACTIONS){
    const s=e.support(r.id);
    if(!s.supported){ assert.throws(()=>e.netIonicEquation(r.id),/NET_IONIC_UNSUPPORTED/,r.id); continue; }
    const eq=e.netIonicEquation(r.id).equation;
    assert.equal(e.netIonicEquation(r.id).equation,eq,'deterministic');
    const p=parseIonicEquation(eq); assert.ok(p.ok,eq);
    const L=side(p.left), R=side(p.right);
    assert.deepEqual(Object.entries(L.atoms).filter(([,n])=>n).sort(),Object.entries(R.atoms).filter(([,n])=>n).sort(),`atoms: ${r.id} ${eq}`);
    assert.equal(L.charge,R.charge,`charge: ${r.id} ${eq}`);
    derived++;
  }
  assert.ok(derived>=5,`${derived} derivable`);
  // a soluble salt without a dissociation rule is unsupported, never treated as molecular
  assert.deepEqual(e.support('rxn.cuso4-na2s'),{supported:false,unsupported:['CuSO4','Na2S']});
  assert.throws(()=>e.netIonicEquation('rxn.agno3-nabr'),/NET_IONIC_UNSUPPORTED:NaBr/);
});

// ------------------------------------------------------------------ gate

test('gate: invalid content FAILs; incomplete-but-valid content is PENDING',()=>{
  const cases=[
    [kb=>{kb.reactions[0].reactants[0].formula='Xy2';},'SPECIES_REF_UNREGISTERED'],
    [kb=>{kb.reactions[0].reactants[0].phase='plasma';},'PHASE_INVALID'],
    [kb=>{kb.electrolysis.records[0].phase='gas-ish';},'PHASE_INVALID'],
    [kb=>{kb.hydrolysis.records.push({...kb.hydrolysis.records[0],salt:'Qq3'});},'SPECIES_REF_UNREGISTERED'],
    [kb=>{kb.solubility.dissociation[0].ions[0].formula='Ag';},'ION_REF_INVALID'],
    [kb=>{const r=structuredClone(kb.reactions.find(x=>x.id==='rxn.agno3-nacl'));r.id='rxn.agno3-nacl-2';r.products=[{formula:'AgNO3'},{formula:'NaCl'}];kb.reactions.push(r);},'REACTION_CONFLICT'],
    [kb=>{const r=structuredClone(kb.reactions.find(x=>x.id==='rxn.agno3-nacl'));r.id='rxn.agno3-nacl-2';r.products=[{formula:'AgNO3'},{formula:'NaCl'}];kb.reactions.push(r);},'MATCHER_AMBIGUOUS'],
    [kb=>{kb.reactions.push(structuredClone(kb.reactions.find(x=>x.id==='rxn.agno3-nacl')));},'REACTION_KB_INVALID'],
    [kb=>{kb.speciesNames.names['species.unobtainium.name']='x';},'SPECIES_NAME_KEY_UNKNOWN'],
    [kb=>{kb.hydrolysis.records[0].reviewStatus='approved';},'APPROVAL_NOT_FROM_REGISTER'],
    [kb=>{kb.register={schema:'kimyolab.chemistry-reviews.v1',records:[{assertionId:'hydrolysis:AlCl3',assertionHash:'0'.repeat(64),decision:'approve',reviewerId:'claude-agent',reviewerRole:'chemistry',reviewedAt:'2026-09-30T00:00:00Z'}]};},'CHEM_REVIEW_REVIEWER_NOT_HUMAN'],
  ];
  for(const [mutate,code] of cases){ const g=gateOf(mutate); assert.equal(g.status,'FAIL',code); assert.ok(g.fail.some(f=>f.startsWith(code)),`${code}: ${g.fail.join(' | ')}`); }
  const g=buildKbReports(root).gate;
  for(const p of ['REVIEW_PENDING:','NO_REACTION_RECORDS_MISSING','LOCALIZATION_PENDING','NET_IONIC_UNSUPPORTED:','CHEMISTRY_REVIEW_REQUIRED:observation:rxn.naoh-hcl']) assert.ok(g.pending.some(x=>x.startsWith(p)),p);
});

// ------------------------------------------------------------------ human-only review + stale

test('review: humans decide via the importer; the current hash counts; a later change makes the approval stale (FAIL)',()=>{
  const t=tempRoot();
  try{
    const before=buildKbReports(t);
    const a=before.assertions.find(x=>x.id==='hydrolysis:AlCl3');
    assert.equal(reviewStateOf(a,[]).state,'pending');
    const decision=(over={})=>({decisions:[{assertionId:a.id,assertionHash:a.hash,decision:'approve',reviewerId:'dr.karimova',reviewerRole:'chemistry',reviewedAt:'2026-09-30T10:00:00Z',comment:null,...over}]});
    for(const [over,code] of [[{reviewerId:'claude-agent'},'CHEM_REVIEW_REVIEWER_NOT_HUMAN'],[{reviewerRole:'didactic'},'CHEM_REVIEW_ROLE_INVALID'],[{decision:'reject'},'CHEM_REVIEW_COMMENT_REQUIRED'],[{assertionHash:'f'.repeat(64)},'CHEM_REVIEW_STALE_DECISION'],[{assertionId:'hydrolysis:Nope'},'CHEM_REVIEW_UNKNOWN_ASSERTION']])
      assert.ok(importDecisions(t,decision(over)).issues.some(i=>i.startsWith(code)),code);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(t,REVIEW_REGISTER_FILE),'utf8')).records,[],'refused decisions write nothing');
    // P1.8: the importer also reports candidate triage decisions (importedCandidates) — same single decision imported
    assert.deepEqual(importDecisions(t,decision()),{imported:1,importedCandidates:0,issues:[]});
    const after=buildKbReports(t);
    assert.equal(reviewStateOf(after.assertions.find(x=>x.id===a.id),JSON.parse(fs.readFileSync(path.join(t,REVIEW_REGISTER_FILE),'utf8')).records).state,'approved');
    assert.equal(after.inventory.counts.reviewed,1);
    assert.equal(after.gate.fail.length,0);
    // the chemistry changes after review → the approval is stale and the gate FAILs until re-reviewed
    const file=path.join(t,'content-src/chemistry/hydrolysis.json');
    const h=JSON.parse(fs.readFileSync(file,'utf8')); h.records.find(x=>x.salt==='AlCl3').medium='basic'; fs.writeFileSync(file,JSON.stringify(h));
    const changed=buildKbReports(t);
    assert.equal(changed.inventory.counts.stale,1);
    assert.ok(changed.gate.fail.includes('APPROVAL_STALE:hydrolysis:AlCl3'));
  }finally{ fs.rmSync(t,{recursive:true,force:true}); }
  // the committed register is empty and only the importer may write it
  assert.deepEqual(read(REVIEW_REGISTER_FILE).records,[]);
  assert.ok(checkSource('scripts/some-tool.ts',"fs.writeFileSync(REVIEW_REGISTER_FILE,x);").some(v=>v.rule==='HUMAN_APPROVAL_WRITTEN_BY_TOOLING'));
  assert.ok(checkSource('scripts/some-tool.ts',"fs.writeFileSync('content-src/chemistry-reviews.json',x);").some(v=>v.rule==='HUMAN_APPROVAL_WRITTEN_BY_TOOLING'));
  assert.deepEqual(checkSource('scripts/chemistry-review/import.ts',fs.readFileSync(path.join(root,'scripts/chemistry-review/import.ts'),'utf8')),[]);
  assert.equal(assertionHash({category:'x',data:{a:1,b:2},sourceRefs:['s']}),assertionHash({category:'x',data:{b:2,a:1},sourceRefs:['s']}),'hash is key-order independent');
});

// ------------------------------------------------------------------ assertions / categories

test('assertions: separate categories — hydrolysis classification and indicator colours are reviewed separately; flags are review items, not edits',()=>{
  const {assertions}=buildKbReports(root);
  const cats=new Set(assertions.map(a=>a.category));
  for(const c of ['reaction','condition','observation','solubility','hydrolysis','indicator','species-name','electrolysis']) assert.ok(cats.has(c),c);
  assert.equal(assertions.filter(a=>a.category==='hydrolysis').length,4);
  assert.deepEqual(assertions.filter(a=>a.category==='indicator').map(a=>a.id).sort(),['indicator:litmus:acidic','indicator:litmus:basic','indicator:litmus:neutral']);
  const naoh=assertions.find(a=>a.id==='observation:rxn.naoh-hcl');
  assert.ok(naoh.flags.includes('CHEMISTRY_REVIEW_REQUIRED'));
  assert.deepEqual(REACTIONS.find(r=>r.id==='rxn.naoh-hcl').observations,[{type:'color-change',to:'changed'}],'the agent did not "fix" the observation');
  for(const a of assertions) for(const k of ['id','category','claim','data','sourceRefs','affectedActivities','hash']) assert.ok(k in a,`${a.id}.${k}`);
  assert.ok(assertions.find(a=>a.id==='reaction:rxn.agno3-nacl').affectedActivities.includes('practice.experiment.8.1'));
});

// ------------------------------------------------------------------ ionic coverage

test('ionic shelf: 21 pairs, 100% classified; NOT_MODELED is never "no reaction"; candidates are suggestions, not truth',()=>{
  const {ionic,coverage}=buildKbReports(root);
  const shelf=ionic.shelves.find(s=>s.activityId==='practice.experiment.8.1');
  assert.equal(shelf.pairs.length,21);
  assert.equal(shelf.summary.classified,21); assert.equal(shelf.summary.unclassified,0);
  assert.equal(shelf.summary.MODELED_REACTION+shelf.summary.MODELED_NO_REACTION+shelf.summary.CONDITION_DEPENDENT+shelf.summary.NOT_MODELED,21);
  assert.equal(shelf.pairs.find(p=>p.formulas.join('+')==='NaCl+H2SO4').class,'CONDITION_DEPENDENT');
  const bacl=shelf.pairs.find(p=>p.formulas.join('+')==='AgNO3+BaCl2');
  assert.deepEqual([bacl.class,bacl.candidate.kind],['NOT_MODELED','reaction-candidate']);
  for(const p of shelf.pairs.filter(p=>p.class==='NOT_MODELED')){ assert.match(p.currentBehavior,/never shown as no reaction/); assert.equal(p.reviewDecisionRequired,true); }
  assert.equal(REACTIONS.length,28,'no candidate became a KB record');
  assert.equal(coverage.ionic.totals.NOT_MODELED,shelf.summary.NOT_MODELED,'unknowns are reported, not hidden');
});

// ------------------------------------------------------------------ localization

test('localization: species names resolve by nameKey from content (pending); the domain carries keys, never names',async()=>{
  const catalog=parseSpeciesNameCatalog(read('content-src/locales/uz-latn/chemistry-species.json'));
  assert.equal(read('content-src/locales/uz-latn/chemistry-species.json').reviewStatus,'pending');
  const localize=createLocalizer({speciesNames:catalog});
  assert.equal(localize('species.nacl.name'),'natriy xlorid');
  assert.equal(localize('species.cuso4.name'),null,'no name → the UI shows the formula');
  assert.throws(()=>parseSpeciesNameCatalog({schema:'kimyolab.locale.chemistry-species.v1',locale:'uz-Latn',names:{'NaCl':'x'}}),/SPECIES_NAMES_INVALID:key/);
  const page=await new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'}).loadPractice('practice.experiment.8.1');
  const r=await new ReferencePracticeSession(page).result();
  assert.deepEqual(r.finalState.ionic.reagents[0],{speciesId:'species.agno3',formula:'AgNO3',nameKey:'species.agno3.name'});
  assert.ok(!JSON.stringify(r.finalState).includes('kumush nitrat'),'no localized text in the domain state');
  const m=toIonicPrecipitationRendererModel(r,createLocalizer(page.localization));
  assert.deepEqual(m.reagents[0],{id:'species.agno3',label:'AgNO₃',name:'kumush nitrat'});
});

// ------------------------------------------------------------------ electrolysis + pilot + global

test('electrolysis: one record → renderer start gate NOT_READY (black-swan); no electrolysis renderer exists',()=>{
  const e=read(REPORTS.electrolysis);
  assert.equal(e.recordCount,read('content-src/chemistry/electrolysis.json').records.length);
  assert.equal(e.rendererStartGate.status,'NOT_READY');
  assert.deepEqual(e.rendererStartGate.learnerChoicesWithTwoValues,[]);
  for(const k of ['phase','electrode','cation','anion']) assert.ok(e.dimensions[k],k);
  assert.ok(!fs.readdirSync(path.join(root,'src/renderers')).some(d=>/electroly/.test(d)));
});

test('pilot and global: P1.7 promotes nothing — pilot statuses unchanged, lu.9.15 not PILOT_READY, global strict off',()=>{
  const {coverage}=buildKbReports(root);
  const matrix=read('reports/pilot-acceptance-matrix.json');
  for(const p of coverage.pilotImpact){
    assert.equal(p.pilotStatus,matrix.rows.find(r=>r.learningUnitId===p.learningUnitId).finalPilotStatus);
    assert.equal(p.signoffByAgent,false);
  }
  assert.notEqual(coverage.pilotImpact.find(p=>p.learningUnitId==='lu.9.15').pilotStatus,'PILOT_READY');
  assert.equal(coverage.globalStrictEnforcement,false);
  assert.deepEqual(read('content-src/pilot-signoffs.json').records,[]);
});
