// TT 4.2 — expert review packet for the canonical chemistry knowledge base. A machine PREPARES the review: it checks
// structure (equation parse, atom and charge conservation, agreement with the canonical balancer, species resolution,
// the condition contract, observation flags, source eligibility) and lists the exact assertion ids and hashes a
// chemistry expert decides on. It never decides: every item stays PENDING until a person records a decision in
// content-src/chemistry-reviews.json (the existing kb-review path). Nothing is fixed, filled in or invented here —
// a failed check is reported, not repaired (e.g. rxn.agno3-nacl: NaCl(aq) is listed with decision OPTIONS only).
//
//   npm run chemistry:expert-packet            write reports/chemistry-expert-review-packet.json + the review doc
//   npm run chemistry:expert-packet -- --check fail if either file is stale
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {balanceSpecies} from '../src/domain/chemistry/equation-balancer.ts';
import {conditionRequirementFields} from '../src/domain/chemistry/reaction-matcher.ts';
import {parseSourceRegistry,sourceAcceptance} from '../src/domain/governance/source-policy.ts';
import {buildChemistryKnowledge,refIds} from './lib/chemistry-knowledge.ts';
import {buildAssertions,loadKb} from './lib/chemistry-kb.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const EXPERT_PACKET_REPORT='reports/chemistry-expert-review-packet.json';
export const EXPERT_PACKET_DOC='docs/reviews/tt-4.2-expert-review-packet.md';
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

type Term={coefficient:number;formula:string};
/** "2H2 + O2 → 2H2O" → terms per side. Only a leading integer is read as a coefficient; nothing else is rewritten. */
export function parseMolecularEquation(eq:string):{reactants:Term[];products:Term[];arrow:string}|null{
  const m=/^(.*?)\s*(→|⇌|->|=)\s*(.*)$/.exec(eq);
  if(!m) return null;
  const side=(s:string)=>s.split(/\s+\+\s+/).map(x=>x.trim()).filter(Boolean).map(t=>{ const c=/^(\d+)(?=[A-Z(\[])/.exec(t); return {coefficient:c?Number(c[1]):1,formula:c?t.slice(c[1]!.length):t}; });
  const reactants=side(m[1]!), products=side(m[3]!);
  return reactants.length&&products.length?{reactants,products,arrow:m[2]!}:null;
}
const atomsOf=(terms:Term[])=>{ const out:Record<string,number>={}; let charge=0;
  for(const t of terms){ const p=parseFormula(t.formula); for(const [el,n] of Object.entries(p.atoms)) out[el]=(out[el]??0)+n*t.coefficient; charge+=p.charge*t.coefficient; }
  return {atoms:Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b))),charge}; };
const sameMultiset=(a:string[],b:string[])=>[...a].sort().join('|')===[...b].sort().join('|');

export function reactionChecks(r:any){
  const parsed=parseMolecularEquation(r.molecularEquation);
  if(!parsed) return {equationParse:'EQUATION_NOT_PARSEABLE' as const};
  const formulasMatchRecord=sameMultiset(parsed.reactants.map(t=>t.formula),r.reactants.map((x:any)=>x.formula))&&sameMultiset(parsed.products.map(t=>t.formula),r.products.map((x:any)=>x.formula));
  let left,right;
  try{ left=atomsOf(parsed.reactants); right=atomsOf(parsed.products); }catch{ return {equationParse:'FORMULA_NOT_PARSEABLE' as const}; }
  const atomBalance=JSON.stringify(left.atoms)===JSON.stringify(right.atoms)?'BALANCED':'UNBALANCED';
  const chargeBalance=left.charge===right.charge?'BALANCED':'UNBALANCED';
  const stated=[...parsed.reactants,...parsed.products].map(t=>t.coefficient);
  let balancer:{status:'AGREES'|'DIFFERS'|'BALANCER_FAILED';coefficients:number[]|null};
  try{ const b=balanceSpecies(parsed.reactants.map(t=>t.formula),parsed.products.map(t=>t.formula)); balancer={status:JSON.stringify(b.coefficients)===JSON.stringify(stated)?'AGREES':'DIFFERS',coefficients:b.coefficients}; }
  catch{ balancer={status:'BALANCER_FAILED',coefficients:null}; }
  const arrowMatchesDirection=(parsed.arrow==='⇌')===(r.direction==='reversible');
  return {equationParse:'PARSED' as const,formulasMatchRecord,statedCoefficients:stated,atomBalance,chargeBalance,atoms:{reactants:left.atoms,products:right.atoms},balancer,arrowMatchesDirection};
}

export function expertPacket(root=ROOT){
  const {index,graph:g,governance}=buildChemistryKnowledge(root);
  const kb=loadKb(root);
  const assertions=new Map(buildAssertions(kb).map(a=>[a.id,a]));
  const {registry}=parseSourceRegistry(readJson(root,'content-src/source-registry.json'));
  const gov=new Map(governance.reactions.map(x=>[x.id,x]));
  const sourceFacts=(ids:string[])=>ids.map(id=>{ const e=registry.byId.get(id); const a=sourceAcceptance(e); return {id,category:e?.category??null,classification:e?.classification??null,canonicalAuthoringEligible:a.canonicalAuthoringEligible,bibliographyMissing:a.bibliographyMissing}; });
  const decisionItem=(id:string)=>{ const a=assertions.get(id); const rg=[...gov.values()].find(x=>x.assertionId===id)??[...gov.values()].find(x=>x.condition?.assertionId===id);
    const review=rg?(rg.assertionId===id?rg.review:rg.condition!.review):'pending';
    return a?{assertionId:id,assertionHash:a.hash,claim:a.claim,currentReview:review,flags:a.flags,expertDecision:'PENDING'}:null; };

  const reactions=g.reactions.map((r:any)=>{
    const rg=gov.get(r.id)!;
    const k=index.reactions.find(x=>x.id===r.id)!;
    const fields=conditionRequirementFields(r.conditions);
    const participants=g.participants.get(r.id)!;
    const unresolved=g.unresolvedParticipants.filter(u=>u.reactionId===r.id);
    return {id:r.id,molecularEquation:r.molecularEquation,reactionType:r.reactionType,direction:r.direction,
      machineChecks:{...reactionChecks(r),
        speciesResolution:unresolved.length?'UNRESOLVED':'RESOLVED',unresolvedParticipants:unresolved,
        participants:{reactants:participants.reactants.map(p=>p.speciesId),products:participants.products.map(p=>p.speciesId)},
        // the condition contract: an unknown field is REJECTED by the matcher (never met) and the KB gate
        conditionFields:fields,conditionUnknownFields:fields.filter(f=>f.startsWith('unknown:')),conditionVerdict:fields.some(f=>f.startsWith('unknown:'))?'REJECT':'CONTRACT_OK',
        observationFlags:rg.observationFlags},
      safetyTags:r.safety??[],
      sources:sourceFacts(refIds(r.sourceRefs)),
      knowledgeIndexReview:k.review,
      decisions:[`reaction:${r.id}`,`no-reaction:${r.id}`,`condition:${r.id}`,`observation:${r.id}`].map(decisionItem).filter(Boolean)};
  });

  const hazardSpecies=g.species.filter((s:any)=>(s.hazards??[]).length).map((s:any)=>({id:s.id,formula:s.formula,phase:s.phase,hazards:s.hazards,
    sources:sourceFacts(refIds(s.sourceRefs)),reviewPath:'NONE — hazards are not a kb-review assertion category yet',expertDecision:'PENDING'}));

  const nacl=g.unresolvedParticipants.filter(u=>u.reactionId==='rxn.agno3-nacl');
  const naclDecision={reactionId:'rxn.agno3-nacl',finding:nacl,registryHas:g.species.filter((s:any)=>s.formula==='NaCl').map((s:any)=>`${s.id} (${s.phase})`),
    options:[
      {option:'A',change:'author a canonical NaCl(aq) species record (with source and review), keep the reaction record as written'},
      {option:'B',change:'change the reaction record so its NaCl participant names a phase the registry holds (a chemistry change — needs the same review)'},
      {option:'C',change:'keep both as they are: the record stays unreachable in the explorer (PHASE_NOT_IN_REGISTRY), no learner claim changes'},
    ],
    machineRecommendation:null,expertDecision:'PENDING',note:'the agent does not choose; the option list is not a ranking'};

  // invariants the acceptance criterion rests on (machine-checkable): nothing unreviewed is shown as reviewed
  const shownReviewed=index.reactions.filter(r=>r.review==='REVIEWED').map(r=>r.id);
  const shownReviewedWithoutApproval=shownReviewed.filter(id=>{ const x=gov.get(id)!; return !(x.review==='approved'&&x.source==='SOURCE_ELIGIBLE'&&(!x.condition||x.condition.review==='approved')); });
  const ids=new Set<string>(), identities=new Set<string>(); const identityIssues:string[]=[], formulaNotParseable:string[]=[];
  for(const s of g.species as any[]){ const key=[s.formula,s.phase,s.charge,s.structuralVariant||'',s.allotrope||''].join('|');
    if(ids.has(s.id)) identityIssues.push(`DUPLICATE_ID:${s.id}`); ids.add(s.id);
    if(identities.has(key)) identityIssues.push(`DUPLICATE_IDENTITY:${key}`); identities.add(key);
    try{ const p=parseFormula(s.formula); if(p.charge!==s.charge) identityIssues.push(`CHARGE_MISMATCH:${s.id}`); }catch{ formulaNotParseable.push(s.id); } }

  const count=(f:(x:any)=>boolean)=>reactions.filter(f).length;
  return {schema:'kimyolab.chemistry-expert-review-packet.v1',phase:'TT 4.2',decision:'NOT_A_REVIEW_DECISION — every item is PENDING until a person decides',
    howToDecide:'record approve / reject / change_required for the listed assertionId + assertionHash in content-src/chemistry-reviews.json (reviewer: a person, not an automation identity); a decision on an old hash is stale',
    speciesIdentity:{records:g.species.length,rule:'SpeciesRegistry: unique id and unique (formula, phase, charge, structuralVariant, allotrope); the formula parser charge equals the record charge',issues:identityIssues,
      // a "formula" that is a name (e.g. a mixture or a trivial name) is UNSUPPORTED by the parser — a known gap, not an identity violation
      formulaNotParseable},
    summary:{reactions:reactions.length,
      equationParsed:count(r=>r.machineChecks.equationParse==='PARSED'),formulasMatchRecord:count(r=>r.machineChecks.formulasMatchRecord===true),
      atomBalanced:count(r=>r.machineChecks.atomBalance==='BALANCED'),chargeBalanced:count(r=>r.machineChecks.chargeBalance==='BALANCED'),
      balancerAgrees:count(r=>r.machineChecks.balancer?.status==='AGREES'),arrowMatchesDirection:count(r=>r.machineChecks.arrowMatchesDirection===true),
      speciesResolved:count(r=>r.machineChecks.speciesResolution==='RESOLVED'),conditionRejected:count(r=>r.machineChecks.conditionVerdict==='REJECT'),
      observationFlagged:count(r=>r.machineChecks.observationFlags.length>0),sourceEligible:count(r=>r.sources.some((s:any)=>s.canonicalAuthoringEligible)),
      decisionsToMake:reactions.reduce((n,r)=>n+r.decisions.length,0),expertReviewed:count(r=>r.knowledgeIndexReview==='REVIEWED'),
      hazardSpecies:hazardSpecies.length,hazardCodes:hazardSpecies.reduce((n:number,s:any)=>n+s.hazards.length,0),reactionSafetyTags:reactions.reduce((n,r)=>n+r.safetyTags.length,0)},
    acceptance:{criterion:'28/28 reactions reviewed by a chemistry expert; 0 unapproved assertions shown as approved',
      reviewed:`${count(r=>r.knowledgeIndexReview==='REVIEWED')}/${reactions.length}`,shownReviewedWithoutApproval,
      status:count(r=>r.knowledgeIndexReview==='REVIEWED')===reactions.length&&!shownReviewedWithoutApproval.length?'MET':'NOT_MET — human review outstanding (DRAFT/PENDING never counts as PASS)'},
    reactions,naclDecision,hazards:{species:hazardSpecies,reactionSafetyTags:reactions.filter(r=>r.safetyTags.length).map(r=>({id:r.id,tags:r.safetyTags}))}};
}

function packetDoc(p:ReturnType<typeof expertPacket>):string{
  const s=p.summary, L:string[]=[];
  L.push('# TT 4.2 — Kimyo ekspert review paketi','',
    '> Bu fayl `npm run chemistry:expert-packet` bilan generatsiya qilinadi; qo‘lda tahrirlamang. Mashina faqat **strukturaviy tekshiruv** qiladi va qaror qabul qilinadigan da’volarni sanaydi. Hech bir band tasdiqlanmagan: har biri `PENDING`. Qaror faqat inson tomonidan `content-src/chemistry-reviews.json` ga yoziladi.','',
    '## Qabul mezoni','',`- Mezon: ${p.acceptance.criterion}`,`- Ekspert ko‘rib chiqqan: **${p.acceptance.reviewed}**`,`- Holat: **${p.acceptance.status}**`,`- Tasdiqsiz “reviewed” ko‘rsatilganlar: ${p.acceptance.shownReviewedWithoutApproval.length}`,'',
    '## Mashina tekshiruvlari (qaror emas)','','| Tekshiruv | Natija |','|---|---|',
    `| Tenglama o‘qildi | ${s.equationParsed}/${s.reactions} |`,`| Formulalar yozuvga mos | ${s.formulasMatchRecord}/${s.reactions} |`,
    `| Atomlar saqlangan | ${s.atomBalanced}/${s.reactions} |`,`| Zaryad saqlangan | ${s.chargeBalanced}/${s.reactions} |`,
    `| Kanonik balancer bilan mos koeffitsientlar | ${s.balancerAgrees}/${s.reactions} |`,`| Strelka ↔ direction | ${s.arrowMatchesDirection}/${s.reactions} |`,
    `| Species aniqlangan (formula + faza) | ${s.speciesResolved}/${s.reactions} |`,`| Noma’lum condition maydoni (REJECT) | ${s.conditionRejected} |`,
    `| Kuzatuv bayroqlari | ${s.observationFlagged} |`,`| Yaroqli manba | ${s.sourceEligible}/${s.reactions} |`,
    `| Species identity buzilishi | ${p.speciesIdentity.issues.length} (${p.speciesIdentity.records} ta yozuv) |`,
    `| Formula o‘rnida nom (parser qo‘llamaydi) | ${p.speciesIdentity.formulaNotParseable.length}: ${p.speciesIdentity.formulaNotParseable.map(x=>'`'+x+'`').join(', ')} |`,'',
    `Qaror kutayotgan da’volar: **${s.decisionsToMake}** (reaction / condition / observation).`,'',
    '## Reaksiyalar','','| # | Reaksiya | Tenglama | Atom | Zaryad | Balancer | Species | Bayroq | Qarorlar |','|---|---|---|---|---|---|---|---|---|');
  p.reactions.forEach((r:any,i:number)=>{ const c=r.machineChecks;
    L.push(`| ${i+1} | \`${r.id}\` | ${r.molecularEquation} | ${c.atomBalance??c.equationParse} | ${c.chargeBalance??'—'} | ${c.balancer?.status??'—'} | ${c.speciesResolution} | ${c.observationFlags.length?c.observationFlags.filter((f:string)=>f!=='CHEMISTRY_REVIEW_REQUIRED').map((f:string)=>f.split(':')[0]).join(', '):'—'} | ${r.decisions.map((d:any)=>`\`${d.assertionId.split(':')[0]}\` ${d.currentReview}`).join('<br>')} |`); });
  L.push('','Har bir da’voning `assertionId` va `assertionHash` qiymatlari: `'+EXPERT_PACKET_REPORT+'` → `reactions[].decisions[]`.','',
    '## rxn.agno3-nacl — NaCl(aq) qarori','',`Topilma: yozuv NaCl(aq) ni nomlaydi; registrda: ${p.naclDecision.registryHas.join(', ')}.`,'');
  for(const o of p.naclDecision.options) L.push(`- **${o.option}.** ${o.change}`);
  L.push('',`Agent tanlamaydi (variantlar tartibi tavsiya emas). Qaror: **${p.naclDecision.expertDecision}**.`,'',
    '## Xavf da’volari (safety review)','',`${s.hazardSpecies} ta species ${s.hazardCodes} ta xavf kodini da’vo qiladi; reaksiyalarda ${s.reactionSafetyTags} ta safety tegi bor. Manba: INTERNAL_PROPOSAL (yaroqsiz). Xavf uchun kb-review kategoriyasi hali yo‘q — review yo‘lini inson belgilashi kerak.`,'',
    '| Species | Faza | Xavf kodlari | Qaror |','|---|---|---|---|');
  for(const h of p.hazards.species as any[]) L.push(`| \`${h.id}\` (${h.formula}) | ${h.phase} | ${h.hazards.join(', ')} | ${h.expertDecision} |`);
  L.push('');
  return L.join('\n');
}

export function expertPacketOutputs(root=ROOT):Record<string,string>{
  const p=expertPacket(root);
  return {[EXPERT_PACKET_REPORT]:`${JSON.stringify(p,null,2)}\n`,[EXPERT_PACKET_DOC]:packetDoc(p)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const check=process.argv.includes('--check'); let stale=0;
  const outputs=expertPacketOutputs(ROOT);
  for(const [rel,body] of Object.entries(outputs)){
    const f=path.join(ROOT,rel);
    if(check){ if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==body){ console.error(`STALE ${rel}`); stale++; } continue; }
    fs.writeFileSync(f,body);
  }
  if(stale) process.exit(1);
  const p=JSON.parse(outputs[EXPERT_PACKET_REPORT]!);
  console.log(JSON.stringify({...p.summary,acceptance:p.acceptance.status.split(' ')[0],check}));
}
