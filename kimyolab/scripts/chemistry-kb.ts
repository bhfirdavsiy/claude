// P1.7: chemistry knowledge-base reports, gate and review packet (content in → reports + packet out).
//   reports/chemistry-kb-inventory.json · chemistry-kb-coverage.json · ionic-pair-coverage.json ·
//   electrolysis-model-readiness.json · review-packets/chemistry-kb/
// Exit 1 on an INVALID knowledge base (gate FAIL). Incomplete-but-valid (review pending, coverage gaps) is PENDING
// and does not fail the build. Nothing here approves anything.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildKbReports,REPORTS,PACKET_DIR} from './lib/chemistry-kb.ts';
import {parseReviewRegister,reviewStateOf} from '../src/domain/chemistry/kb-review.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export function buildPacket(r:ReturnType<typeof buildKbReports>){
  const reg=parseReviewRegister(r.kb.register);
  const assertions=r.assertions.map(a=>({
    id:a.id,category:a.category,claim:a.claim,data:a.data,sourceRefs:a.sourceRefs,affectedActivities:a.affectedActivities,
    reviewStatus:reviewStateOf(a,reg.records).state,currentHash:a.hash,flags:a.flags,
    reviewDecision:null,comment:null,
  }));
  const template={
    schema:'kimyolab.chemistry-review-decisions.v1',
    instructions:'Fill decision (approve | reject | change_required), reviewerId (a person), reviewedAt (ISO date) and a comment for every non-approval; leave decision null to skip. Import with: node --experimental-strip-types scripts/chemistry-review/import.ts <this file>. A decision on an outdated hash is refused.',
    decisions:r.assertions.map(a=>({assertionId:a.id,assertionHash:a.hash,decision:null,reviewerId:null,reviewerRole:'chemistry',reviewedAt:null,comment:null})),
  };
  const candidates=r.ionic.shelves.flatMap((s:any)=>s.pairs.filter((p:any)=>p.reviewDecisionRequired).map((p:any)=>({
    pair:p.formulas.join(' + '),reagents:p.reagents,class:p.class,currentBehavior:p.currentBehavior,
    whyNeeded:`both reagents are on the learner shelf of ${s.activityId}; a learner can mix them today and sees “modelda yo‘q”`,
    activitiesAffected:[s.activityId],candidate:p.candidate,
    reviewDecisionRequired:'add a reviewed reaction record, add a reviewed explicit no-reaction record, or confirm it stays not modeled (the agent adds nothing)',
  })));
  const byCat=(c:string)=>assertions.filter(a=>a.category===c);
  const readme=[
    '# Chemistry KB review packet (P1.7)','',
    '> Faqat inson reviewer uchun. Bu paket **approval emas**. Qaror `decisions.template.json` orqali to‘ldiriladi va `scripts/chemistry-review/import.ts` bilan `content-src/chemistry-reviews.json` registeriga import qilinadi. Agent va tooling hech qanday qaror yozmaydi.','',
    '## Holat','',
    `- Assertion’lar: **${assertions.length}** — ${['approved','pending','stale','rejected','change_required'].map(s=>`${s}: ${assertions.filter(a=>a.reviewStatus===s).length}`).join(', ')}`,
    `- Gate: **${r.gate.status}** (FAIL: ${r.gate.fail.length}, PENDING: ${r.gate.pending.length})`,
    `- Har assertion’ning hash’i o‘zgarsa, eski qaror **stale** bo‘ladi va hisobga olinmaydi.`,'',
    '## Kategoriyalar','',
    '| Kategoriya | Soni | Review talab (flag) |','|---|---|---|',
    ...['reaction','no-reaction','condition','observation','solubility','hydrolysis','indicator','species-name','electrolysis'].map(c=>`| ${c} | ${byCat(c).length} | ${byCat(c).filter(a=>a.flags.length).length} |`),'',
    '## Alohida e’tibor (CHEMISTRY_REVIEW_REQUIRED)','',
    ...assertions.filter(a=>a.flags.length).map(a=>`- \`${a.id}\` — ${a.flags.filter(f=>f!=='CHEMISTRY_REVIEW_REQUIRED').join('; ')}`),'',
    '- `indicator:*` yozuvlari hydrolysis klassifikatsiyasidan **alohida** assertion: har biri o‘zi review qilinadi.','',
    `## Model qamrovi bo‘yicha nomzodlar (${candidates.length})`,'',
    '`candidates.json`: o‘quvchi tokchasidagi, hozir `NOT_MODELED` yoki `CONDITION_DEPENDENT` juftliklar. `candidate` — eruvchanlik qoidalaridan chiqarilgan **taklif**, kanonik haqiqat emas.','',
  ].join('\n')+'\n';
  return {assertions,template,candidates,readme};
}

export function writeAll(base=root){
  const r=buildKbReports(base);
  const write=(rel:string,body:unknown)=>{ fs.mkdirSync(path.dirname(path.join(base,rel)),{recursive:true}); fs.writeFileSync(path.join(base,rel),typeof body==='string'?body:`${JSON.stringify(body,null,2)}\n`,'utf8'); };
  write(REPORTS.inventory,r.inventory); write(REPORTS.coverage,r.coverage); write(REPORTS.ionic,r.ionic); write(REPORTS.electrolysis,r.electrolysis);
  const p=buildPacket(r);
  write(`${PACKET_DIR}/assertions.json`,{schema:'kimyolab.chemistry-kb-assertions.v1',assertions:p.assertions});
  write(`${PACKET_DIR}/decisions.template.json`,p.template);
  write(`${PACKET_DIR}/candidates.json`,{schema:'kimyolab.chemistry-kb-candidates.v1',candidates:p.candidates});
  write(`${PACKET_DIR}/README.md`,p.readme);
  return r;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=writeAll();
  console.log(JSON.stringify({gate:r.gate.status,fail:r.gate.fail.length,pending:r.gate.pending.length,assertions:r.assertions.length,ionic:r.coverage.ionic.totals,electrolysisGate:r.electrolysis.rendererStartGate.status}));
  if(r.gate.status==='FAIL'){ for(const f of r.gate.fail) console.error(f); process.exitCode=1; }
}
