// P2.14 — Substance Passport + Reaction Explorer reports (ADR-P2-015). Deterministic; every coverage dimension is
// reported separately and is never merged into one "completion" percentage.
//   npm run knowledge:report            → the six reports below
//   npm run knowledge:report -- --check → fails when a committed report differs from the generator
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ReactionMatcher} from '../src/domain/chemistry/reaction-matcher.ts';
import {parseConditionVocabulary} from '../src/domain/chemistry/condition-vocabulary.ts';
import {explore,parseExplorerQuery,reactionExplorerHref} from '../src/features/chemistry-knowledge/explorer.ts';
import {CHEMISTRY_KNOWLEDGE_PACK_PATH,RELATION_PROVENANCE,type KnowledgeField} from '../src/features/chemistry-knowledge/knowledge.ts';
import {FEATURE_FLAGS} from '../src/app/feature-flags.ts';
import {buildChemistryKnowledge} from './lib/chemistry-knowledge.ts';
import {buildElementHub} from './lib/element-hub.ts';
import {bundle} from './lib/computed-model-interaction.ts';
import {bundleDelta} from './guided-dynamic-lab.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
export const KNOWLEDGE_REPORTS={
  inventory:'reports/substance-inventory.json',
  passport:'reports/substance-passport-coverage.json',
  explorer:'reports/reaction-explorer-coverage.json',
  governance:'reports/reaction-governance-coverage.json',
  relations:'reports/chemistry-knowledge-relations.json',
  readiness:'reports/substance-reaction-readiness.json',
};
/** the taxonomy every field of a substance or reaction is classified in (reports only; never shown to a learner) */
export const FIELD_TAXONOMY={
  CANONICAL_IDENTITY:'the SpeciesRegistry identity (id, formula, phase, charge, variant, allotrope) — the runtime model uses it',
  CANONICAL_MODEL_STATE:'operational model data the runtime uses (phase/charge as identity, dissociation rules, reaction records, observations) — not a human-reviewed fact',
  REVIEWED_FACT:'a human approved the claim on its current hash and an eligible registered source backs it',
  ENGINE_COMPUTED:'computed by a domain engine (IonicEngine net ionic equation) or from reviewed atomic masses',
  DERIVED:'read by the canonical formula parser (composition, element links)',
  SOURCE_PENDING:'a claim exists in the data but its source is not eligible or its review is missing',
  GAP:'nothing in the repository can vouch for it',
  UNSUPPORTED:'the model cannot express it (e.g. a "formula" that is a name)',
} as const;
const BASE={phase:'P2.14',decision:'NOT_A_RELEASE_OR_PILOT_DECISION'};
const put=(x:unknown)=>`${JSON.stringify(x,null,2)}\n`;
const tally=(xs:string[])=>Object.fromEntries([...new Set(xs)].sort().map(k=>[k,xs.filter(x=>x===k).length]));
const fieldState=(f:KnowledgeField<unknown>)=>f.status==='GAP'?`GAP:${f.reason}`:f.status;
const taxonomyOf=(f:KnowledgeField<unknown>)=>f.status==='DERIVED'?'DERIVED':f.status==='COMPUTED'?'ENGINE_COMPUTED':f.status==='MODEL'?'CANONICAL_MODEL_STATE':f.status==='REVIEWED'?'REVIEWED_FACT'
  :f.reason==='FORMULA_NOT_PARSEABLE'?'UNSUPPORTED':f.reason==='SOURCE_NOT_ELIGIBLE'||f.reason==='REVIEW_PENDING'||f.reason==='OBSERVATION_REVIEW_REQUIRED'?'SOURCE_PENDING':'GAP';

export function knowledgeOutputs(root=ROOT):Record<string,string>{
  const {index,graph:g,governance,vocabularyReview}=buildChemistryKnowledge(root);
  const {hub}=buildElementHub(root);
  const vocabulary=parseConditionVocabulary(readJson(root,'content-src/chemistry/condition-vocabulary.json'));
  const solubility=readJson(root,'content-src/chemistry/solubility.json');
  const registryRaw=readJson(root,'content-src/source-registry.json');
  const speciesNames=readJson(root,'content-src/locales/uz-latn/chemistry-species.json');
  const matcher=ReactionMatcher.from(g.reactions,{vocabulary});
  const domain={matcher,registry:g.registry,vocabulary};
  const S=index.substances, R=index.reactions;
  const sp=(id:string)=>g.registry.byId(id)!;

  // ------------------------------------------------------------ 1. inventory (re-derived from the repository)
  const formulaCounts=tally(g.species.map(s=>s.formula));
  const inventory={schema:'kimyolab.substance-inventory.v1',...BASE,
    semantics:'Every canonical species and reaction record, re-derived from the repository (no number is hard-coded), and how each field is known.',
    taxonomy:FIELD_TAXONOMY,
    sources:{
      species:{file:'content-src/chemistry/species.json',records:g.species.length,identity:'SpeciesRegistry (src/domain/chemistry/species-registry.ts): unique id and unique (formula, phase, charge, structuralVariant, allotrope)'},
      reactions:{file:'content-src/chemistry/reactions.json',records:g.reactions.length,runtime:'ReactionMatcher (src/domain/chemistry/reaction-matcher.ts), policy require-record-conditions'},
      ionicEngine:{module:'src/domain/chemistry/ionic-engine.ts',dissociationRules:(solubility.dissociation??[]).length,insolubleList:(solubility.insoluble??[]).length},
      conditionVocabulary:{file:'content-src/chemistry/condition-vocabulary.json',terms:Object.keys(vocabulary.terms).length,contexts:Object.keys(vocabulary.contexts).length,reviewStatus:vocabularyReview},
      elementHub:{pack:'periodic/element-hub.json',elements:hub.elements.length,role:'the same canonical graph (scripts/lib/chemistry-graph.ts) — Element ↔ Substance / Reaction'},
      mappingLinks:{file:'content-src/mapping-links.json',records:g.mappings.length,role:'Lab → Topic'},
      topicLabProfiles:{file:'content-src/topic-lab-profiles.json',labsWithShelfSpecies:g.labSpecies.size,role:'Substance → Lab (shelf)'},
      guidedStepReactionMap:{file:'content-src/chemistry/guided-step-reaction-map.json',labsWithReactions:g.labReactions.size,role:'Reaction → Lab'},
    },
    species:{
      total:g.species.length,
      parseableFormulas:g.substanceElements.size,
      unparseable:g.unparsedSubstances.map(id=>({id,formula:sp(id).formula})),
      sharedFormulas:Object.entries(formulaCounts).filter(([,n])=>n>1).map(([formula,n])=>({formula,species:n})),
      charged:g.species.filter(s=>s.charge!==0).length,
      phases:tally(g.species.map(s=>s.phase)),
      localizedNames:Object.keys(speciesNames.names??{}).length,localizedNamesReview:speciesNames.reviewStatus,
      sourceRefIds:tally(g.species.flatMap(s=>(s.sourceRefs as any[]).map(r=>typeof r==='string'?r:r.id))),
    },
    reactions:{total:g.reactions.length,byType:tally(g.reactions.map(r=>r.reactionType)),explicitNoReaction:g.reactions.filter(r=>r.reactionType==='no-reaction').length,
      sourceRefIds:tally(g.reactions.flatMap(r=>(r.sourceRefs as any[]).map(x=>typeof x==='string'?x:x.id)))},
    perSpecies:S.map(s=>{ const x=sp(s.id); return {id:s.id,key:s.key,formula:x.formula,phase:x.phase,charge:x.charge,nameKey:x.nameKey,
      fields:{identity:'CANONICAL_IDENTITY',phase:'CANONICAL_MODEL_STATE',charge:'CANONICAL_MODEL_STATE',composition:taxonomyOf(s.composition),molarMass:taxonomyOf(s.molarMass),dissociation:taxonomyOf(s.dissociation),hazards:taxonomyOf(s.hazards),properties:taxonomyOf(s.properties)}}; }),
  };

  // ------------------------------------------------------------ 2. passport coverage (each field separately)
  const field=(get:(s:typeof S[number])=>KnowledgeField<unknown>)=>tally(S.map(s=>fieldState(get(s))));
  const passport={schema:'kimyolab.substance-passport-coverage.v1',...BASE,
    semantics:'What the Substance Passport can show for each canonical species, field by field. A gap is a natural Uzbek sentence for the learner; the reason stays here.',
    substances:S.length,
    fields:{
      name:{localized:S.filter(s=>speciesNames.names?.[sp(s.id).nameKey]).length,shownAsFormula:S.filter(s=>!speciesNames.names?.[sp(s.id).nameKey]).length,review:speciesNames.reviewStatus},
      formula:{canonical:S.length},
      phase:{canonicalModelState:S.length},
      charge:{canonicalModelState:S.length,charged:g.species.filter(s=>s.charge!==0).length},
      composition:field(s=>s.composition),
      molarMass:field(s=>s.molarMass),
      dissociation:field(s=>s.dissociation),
      hazards:field(s=>s.hazards),
      properties:field(s=>s.properties),
    },
    relations:{withElements:S.filter(s=>s.relations.elements.length).length,withReactions:S.filter(s=>s.relations.reactions.length).length,withLabs:S.filter(s=>s.relations.labs.length).length,withTopics:S.filter(s=>s.relations.topics.length).length},
    notes:{
      molarMass:`computed only from atomic masses a human reviewed against an eligible source (P2.13 Element Hub: ${hub.elements.filter(e=>e.relativeAtomicMass.status==='REVIEWED').length} reviewed); legacy masses are never read, nothing is rounded`,
      dissociation:'DISSOCIATION_NOT_MODELED means the model has no rule — never "does not dissociate"',
      hazards:'species hazard codes are operational migration data (INTERNAL_PROPOSAL source); no learner sees them as a reviewed fact. Lab safety (topic lab profiles, practice safety notes) is unchanged',
    },
  };

  // ------------------------------------------------------------ 3. explorer coverage (the real matcher, all pairs)
  const roundTrip=R.map(r=>{
    const href=reactionExplorerHref(index,r.id,'');
    if(!href) return {id:r.id,reachable:false,reason:'REACTANT_NOT_A_CANONICAL_SPECIES',unresolved:g.unresolvedParticipants.filter(u=>u.reactionId===r.id)};
    const st=parseExplorerQuery(new URL(`http://x${href}`).searchParams,index);
    const o=explore(domain,st.speciesIds,st.stated);
    return {id:r.id,reachable:o.kind!=='NOT_MODELED'&&'reactionId' in o&&o.reactionId===r.id,outcome:o.kind};
  });
  // every unordered pair of canonical species (their own phase), by what the model holds for it — before conditions
  const pairs={modeledReaction:0,modeledNoReaction:0,notModeled:0,conditionDependent:0};
  for(let i=0;i<g.species.length;i++) for(let j=i+1;j<g.species.length;j++){
    const a=g.species[i]!, b=g.species[j]!;
    const c=matcher.candidates([{formula:a.formula,phase:a.phase},{formula:b.formula,phase:b.phase}]);
    if(!c.length) pairs.notModeled++;
    else if(c.every(r=>r.reactionType==='no-reaction')) pairs.modeledNoReaction++;
    else { pairs.modeledReaction++; if(c.some(r=>(r.conditions?.tags??[]).length)) pairs.conditionDependent++; }
  }
  const reactantSets=tally(g.reactions.map(r=>r.reactants.map(x=>x.formula).sort().join(' + ')));
  const explorer={schema:'kimyolab.reaction-explorer-coverage.v1',...BASE,
    semantics:'What the Reaction Explorer can answer through the existing ReactionMatcher. MODELED_REACTION, MODELED_NO_REACTION and NOT_MODELED are separate; NOT_MODELED is never shown as "no reaction".',
    matcher:{module:'src/domain/chemistry/reaction-matcher.ts',policy:'require-record-conditions',phase:'the canonical species\' own phase (never guessed)',conditions:'only what the learner states; unknown values are refused'},
    records:{total:R.length,modeledReactions:g.reactions.filter(r=>r.reactionType!=='no-reaction').length,explicitNoReaction:g.reactions.filter(r=>r.reactionType==='no-reaction').length},
    reachability:{reachable:roundTrip.filter(x=>x.reachable).length,unreachable:roundTrip.filter(x=>!x.reachable)},
    pairsOfCanonicalSpecies:{total:g.species.length*(g.species.length-1)/2,...pairs,note:'counts the records written for a pair (any conditions); NOT_MODELED pairs are unknown, not non-reacting'},
    conditionDependence:{recordsWithRequirements:R.filter(r=>Object.keys(r.requirements).length).length,reagentSetsWithSeveralRecords:Object.entries(reactantSets).filter(([,n])=>n>1).map(([set,records])=>({set,records}))},
    ionicEquation:{supported:R.filter(r=>r.ionicEquation.status==='COMPUTED').map(r=>r.id),notSupported:R.filter(r=>r.ionicEquation.status!=='COMPUTED').length,rule:'shown only when IonicEngine.support(reactionId) is supported:true; never a fallback'},
    observations:tally(R.map(r=>fieldState(r.observations))),
  };

  // ------------------------------------------------------------ 4. governance (model record ≠ human review)
  const G=governance.reactions;
  const registryIds=new Set((registryRaw.sources??[]).map((s:any)=>s.id));
  const gov={schema:'kimyolab.reaction-governance-coverage.v1',...BASE,
    semantics:'A reaction record in the model is not a human approval. Review state comes from the chemistry decision register (kb-review: current hash, human reviewer, stale on edit); a source counts only when registered, acceptable for chemistry and human-accepted.',
    totals:{canonicalModelRecords:G.length,effectiveHumanReviewed:G.filter(x=>x.reviewed).length,reviewPending:G.filter(x=>x.review==='pending').length,stale:G.filter(x=>x.review==='stale').length,
      approvedButSourceNotEligible:G.filter(x=>x.review==='approved'&&!x.reviewed).length,
      source:tally(G.map(x=>x.source)),observationFlagged:G.filter(x=>x.observationFlags.includes('CHEMISTRY_REVIEW_REQUIRED')).length},
    sourceRefsAudit:{
      speciesFormat:'object {id,type,title}',reactionsFormat:'object {id,type,title}',
      adapter:'only the id is kept; title, category and acceptance come from content-src/source-registry.json. An id the registry does not know stays SOURCE_REQUIRED.',
      ids:[...new Set([...governance.substances.flatMap(s=>s.sourceRefs),...G.flatMap(r=>r.sourceRefs)])].sort().map(id=>{ const e=(registryRaw.sources??[]).find((s:any)=>s.id===id); return {id,registered:registryIds.has(id),category:e?.category??null,classification:e?.classification??null}; }),
    },
    substances:{total:governance.substances.length,source:tally(governance.substances.map(s=>s.source)),hazardsClaimed:governance.substances.filter(s=>s.hazardsClaimed>0).length,propertiesClaimed:governance.substances.filter(s=>s.propertiesClaimed>0).length,reviewedHazards:0,reviewedProperties:0},
    reactions:G.map(x=>({id:x.id,assertionId:x.assertionId,hash:x.hash,review:x.review,source:x.source,reviewed:x.reviewed,observationFlags:x.observationFlags,conditionAssertion:x.conditionAssertion})),
    learnerWording:{modelRecord:'a model record is shown as KimyoLab model data, never as expert-approved',reviewed:'only an effectively reviewed record may say it was checked by a chemistry reviewer'},
  };

  // ------------------------------------------------------------ 5. relations (one canonical graph)
  const hubSubstanceLinks=hub.elements.reduce((n,e)=>n+e.relations.substances.length,0);
  const knowledgeSubstanceLinks=S.reduce((n,s)=>n+s.relations.elements.length,0);
  const relations={schema:'kimyolab.chemistry-knowledge-relations.v1',...BASE,
    semantics:'Every relation of the Element Hub and the knowledge index comes from scripts/lib/chemistry-graph.ts — one graph. No keyword or title matching, no inference; PRIMARY only through an explicit, reviewed authored relation.',
    provenance:RELATION_PROVENANCE,
    counts:{
      elementSubstance:{knowledgeIndex:knowledgeSubstanceLinks,elementHub:hubSubstanceLinks,consistent:knowledgeSubstanceLinks===hubSubstanceLinks},
      substanceReaction:S.reduce((n,s)=>n+s.relations.reactions.length,0),
      reactionLab:R.reduce((n,r)=>n+r.relations.labs.length,0),
      reactionTopic:R.reduce((n,r)=>n+r.relations.topics.length,0),
      substanceLab:{total:S.reduce((n,s)=>n+s.relations.labs.length,0),viaShelf:S.reduce((n,s)=>n+s.relations.labs.filter(l=>l.via.includes('topic-lab-profile:shelf')).length,0),viaReaction:S.reduce((n,s)=>n+s.relations.labs.filter(l=>l.via.some(v=>v.startsWith('rxn.'))).length,0)},
      substanceTopic:S.reduce((n,s)=>n+s.relations.topics.length,0),
      primary:0,
    },
    unresolvedParticipants:g.unresolvedParticipants,
    unparsedReactionFormulas:g.unparsedReactionFormulas,
    navigation:{elementToSubstance:'Element profile → /substance/<key> (substancePassportV1)',substanceToElement:'Passport → /periodic/<symbol> (periodicTableV1)',substanceToReaction:'Passport → /reactions?r=…&c=… (reactionExplorerV1; the explorer runs the matcher)',elementToReaction:'Element profile → /reactions?… (reactionExplorerV1)'},
  };

  // ------------------------------------------------------------ 6. readiness
  const bd=bundleDelta(root,bundle(root) as any);
  const progress=readJson(root,'reports/project-progress.json');
  const readiness={schema:'kimyolab.substance-reaction-readiness.v1',...BASE,
    semantics:'What the Substance Passport and the Reaction Explorer do, what is a gap and what needs a human. Coverage dimensions stay separate (see the other five reports).',
    featureFlags:{
      substancePassportV1:{default:FEATURE_FLAGS.substancePassportV1.default,offBehaviour:'/substance/… renders the existing “page not found”; no substance links or search entries'},
      reactionExplorerV1:{default:FEATURE_FLAGS.reactionExplorerV1.default,offBehaviour:'/reactions renders the existing “page not found”; no reaction links or search entries'},
    },
    routes:{passport:'/substance/<key> (key = canonical species id without the species. namespace; a formula is never a route key)',explorer:'/reactions?r=<key>&c=<dimension>:<value>',hosts:['portal (server allow-list: /reactions, /substance/)','standalone (hash route)'],deepLinkRefresh:true},
    coverage:{
      canonicalSpecies:S.length,parseableFormulas:g.substanceElements.size,sharedFormulas:inventory.species.sharedFormulas.length,
      computedComposition:S.filter(s=>s.composition.status==='DERIVED').length,
      molarMassShown:S.filter(s=>s.molarMass.status!=='GAP').length,
      dissociationModeled:S.filter(s=>s.dissociation.status==='MODEL').length,
      reviewedProperties:0,reviewedHazards:0,
      reactionRecords:R.length,explorerReachable:explorer.reachability.reachable,explicitNoReactionRecords:explorer.records.explicitNoReaction,
      pairs:explorer.pairsOfCanonicalSpecies,
      ionicEquationSupported:explorer.ionicEquation.supported.length,
      humanReviewedReactions:gov.totals.effectiveHumanReviewed,sourceGaps:gov.totals.source,
      topicLabBacklinks:{substancesWithLabs:passport.relations.withLabs,substancesWithTopics:passport.relations.withTopics,reactionsWithLabs:R.filter(r=>r.relations.labs.length).length,reactionsWithTopics:R.filter(r=>r.relations.topics.length).length},
    },
    search:{system:'the existing learner search (src/features/search/model.ts) — no second search',entries:['substance: formula (exact), localized name where the catalog has one','reaction: its equation; reactant and product formulas (exact)'],resultTypes:['Element','Modda','Reaksiya','Mavzu','Laboratoriya'],flagged:'substances join with substancePassportV1, reactions with reactionExplorerV1'},
    accessibility:{tested:'tests/e2e/substance-reaction.spec.mjs',checks:['reagent selector: native checkboxes and a labelled formula field (no drag)','result announced in a polite live region; errors in an assertive one','focus moves to the result heading after a search','320 px reflow, 44/48 px targets','no colour-only observation (text)','reduced motion'],learnerInvariant:'140 / 5 / 0 / 1 (the sweep covers learning activities; these pages are tested by their own suite)'},
    performance:{chemistry:'browser-local: the ReactionMatcher runs in the page over the pack records; no server lookup',knowledgeIndex:{packFile:CHEMISTRY_KNOWLEDGE_PACK_PATH,bytes:Buffer.byteLength(`${JSON.stringify(index)}\n`,'utf8')},bundle:bd.phases['P2.14'],report:'reports/guided-dynamic-lab-readiness.json#bundleDelta.phases["P2.14"]'},
    isolation:{contentStudio:'no substance or reaction editor; the Studio is unchanged',learnerProgress:'none: no profile, attempt or evidence written',failure:'a failed knowledge load shows an error on these pages only; curriculum, dynamic lab, periodic table, textbook excerpt and Content Studio do not import this feature'},
    notInScope:['external lab catalogue redesign','learner navigation overhaul','AI chemistry generation','new chemistry records to raise coverage','mass source acceptance','automated human review','login, progress dashboard, leaderboard, IChO'],
    humanDecisions:[
      {decision:'reviewed sources for atomic masses (unlocks molar mass) — P2.13 metadata',status:'human review required'},
      {decision:'chemistry review of the 28 reaction records, their conditions and observations (decision register)',status:'human review required'},
      {decision:'the 6 observations flagged by the KB integrity check',status:'human review required'},
      {decision:'species hazards / properties: an eligible source and a review path',status:'human decision required'},
      {decision:'rxn.agno3-nacl names NaCl(aq); the registry has NaCl only as a solid — add the species or change the record',status:'human decision required'},
      {decision:'explicit no-reaction records (none exist; Cu + dilute HCl stays not modeled)',status:'human authoring + review required'},
      {decision:'localized names of the species without one',status:'human review required'},
    ],
    formalMetrics:{learningProduct:progress.learningProductProgress.percent,overall:progress.overallManagementEstimate.percent,note:'the passport and explorer are reference features; no formal formula input changed'},
  };
  return {[KNOWLEDGE_REPORTS.inventory]:put(inventory),[KNOWLEDGE_REPORTS.passport]:put(passport),[KNOWLEDGE_REPORTS.explorer]:put(explorer),[KNOWLEDGE_REPORTS.governance]:put(gov),[KNOWLEDGE_REPORTS.relations]:put(relations),[KNOWLEDGE_REPORTS.readiness]:put(readiness)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const check=process.argv.includes('--check'); let stale=0;
  const outputs=knowledgeOutputs(ROOT);
  for(const [rel,body] of Object.entries(outputs)){
    const f=path.join(ROOT,rel);
    if(check){ if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==body){ console.error(`STALE ${rel}`); stale++; } continue; }
    fs.writeFileSync(f,body);
  }
  if(stale) process.exit(1);
  const r=JSON.parse(outputs[KNOWLEDGE_REPORTS.readiness]!);
  console.log(JSON.stringify({species:r.coverage.canonicalSpecies,reactions:r.coverage.reactionRecords,reachable:r.coverage.explorerReachable,ionic:r.coverage.ionicEquationSupported,reviewedReactions:r.coverage.humanReviewedReactions,check}));
}
