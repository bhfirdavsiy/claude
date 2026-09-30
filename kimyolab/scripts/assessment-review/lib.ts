// Assessment review tooling (P1.2 §39). It prepares packets and imports HUMAN decisions; it never decides.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assessmentItemHash,validateReviewRecord,REVIEW_REGISTER_SCHEMA,REVIEW_ROLES,type AssessmentReviewRecord} from '../../src/domain/assessment/governance.ts';

export const PACKET_DIR='review-packets/assessment-pilot';
export const TEMPLATE_FILE=`${PACKET_DIR}/review-register.template.json`;
export const REGISTER_FILE='content-src/assessment-reviews.json';
export const sha256=(buf:Buffer|string)=>createHash('sha256').update(buf).digest('hex');

export function readJson(root:string,rel:string){return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}

const DEMAND_CHECKLIST=['Kimyoviy jihatdan to‘g‘ri javob faqat bitta','Distraktorlar kimyoviy jihatdan noto‘g‘ri, lekin mantiqli','Terminlar o‘quv dasturiga mos','Formula/belgilar to‘g‘ri yozilgan'];
const LANGUAGE_CHECKLIST=['Savol o‘zbek tilida aniq va bir ma’noli','Variantlar uzunligi va uslubi bir xil','To‘g‘ri javobga ishora (clue) yo‘q','Izoh o‘quvchi uchun tushunarli'];

export function renderPacket(item:any,unit:any,itemHash:string):string{
  const outcome=(id:string)=>{const m=/#o([0-9]+)$/.exec(id);return m?unit?.learningOutcomes?.[Number(m[1])-1]??'(topilmadi)':'(noto‘g‘ri id)';};
  const lines=[
    `# Assessment review packet — ${item.id}`,'',
    '> Faqat reviewer uchun. To‘g‘ri javob shu hujjatda ko‘rinadi — o‘quvchi pack’i bilan aralashtirmang.','',
    '| Maydon | Qiymat |','|---|---|',
    `| itemId | \`${item.id}\` |`,
    `| LearningUnit | \`${item.learningUnitId}\` — ${unit?.title??'?'} |`,
    `| grade | ${unit?.grade??'?'} |`,
    `| itemVersion | ${item.version} |`,
    `| itemHash (sha256) | \`${itemHash}\` |`,
    `| provenance | ${item.provenance?`authoredBy=${item.provenance.authoredBy}, aiGenerated=${item.provenance.aiGenerated}`:'aniqlanmagan (bankda yozilmagan) — reviewer tekshirsin'} |`,
    '','## Savol','',item.prompt,'','## Variantlar','',
    ...item.options.map((o:any)=>`- **${o.id}.** ${o.text}${o.id===item.correctOptionId?'  ← to‘g‘ri javob':''}`),'',
    `**To‘g‘ri javob:** ${item.correctOptionId}`,'',`**Izoh:** ${item.explanation}`,'',
    '## Bog‘lanishlar','',
    `- Konseptlar: ${item.conceptIds.map((c:string)=>`\`${c}\``).join(', ')}`,
    `- Taklif qilingan outcome: ${(item.outcomeIds??[]).map((o:string)=>`\`${o}\` — “${outcome(o)}”`).join('; ')||'yo‘q'}`,'',
    '## Reviewer to‘ldiradi','',
    '- Cognitive demand (eslash / tushunish / qo‘llash / tahlil): ____',
    '- Maqsad qilingan misconception: ____',
    '- Outcome bog‘lanishi to‘g‘rimi? (ha / yo‘q, izoh): ____','',
    '### Kimyoviy to‘g‘rilik (chemistry reviewer)','',...DEMAND_CHECKLIST.map(c=>`- [ ] ${c}`),'',
    '### Til va didaktika (didactic reviewer)','',...LANGUAGE_CHECKLIST.map(c=>`- [ ] ${c}`),'',
    '## Qaror','',
    'Qaror `review-register.template.json` nusxasida yoziladi (rol bo‘yicha alohida qator):',
    '`decision` (approved | rejected | changes_requested), `reviewerId` (shaxs, avtomatlashtirish emas), `reviewedAt` (ISO), `comment`.',
    'Didactic reviewer qo‘shimcha ravishda `outcomeDecision` (confirm | reject | change_required) yozadi — outcome bog‘lanishi faqat taklif.',
    'Tasdiqdan boshqa har qanday qaror uchun `comment` majburiy. Chemistry va didactic tasdig‘ini ikki xil shaxs beradi.',
    'Import: `npm run assessment:review:import -- <to‘ldirilgan-register.json>`.','',
  ];
  return lines.join('\n');
}

export function buildPackets(root:string){
  const bank=readJson(root,'content-src/assessment-items.json');
  const units=readJson(root,'content-src/learning-units.json');
  const dir=path.join(root,PACKET_DIR);
  fs.mkdirSync(dir,{recursive:true});
  const rows:any[]=[];
  for(const item of bank.items){
    if(item.lifecycle==='RETIRED') continue;
    const unit=units.find((u:any)=>u.id===item.learningUnitId);
    const hash=assessmentItemHash(item);
    const rel=`${PACKET_DIR}/${item.id}.md`;
    const body=renderPacket(item,unit,hash);
    fs.writeFileSync(path.join(root,rel),body,'utf8');
    for(const role of REVIEW_ROLES) rows.push({itemId:item.id,role,decision:null,reviewerId:null,reviewerRole:role,reviewedAt:null,itemHash:hash,itemVersion:item.version,evidence:{packet:rel,packetSha256:sha256(body)},...(role==='didactic'?{outcomeDecision:null}:{}),comment:''});
  }
  const template={schema:REVIEW_REGISTER_SCHEMA,instructions:'Copy this file, fill decision/reviewerId/reviewedAt/comment per row for the rows YOU reviewed, leave others null, then run npm run assessment:review:import -- <file>.',records:rows};
  fs.writeFileSync(path.join(root,TEMPLATE_FILE),`${JSON.stringify(template,null,2)}\n`,'utf8');
  return {packets:bank.items.length,rows:rows.length};
}

/** Validates a filled register against the CURRENT bank and packets. Returns filled rows + issues. */
export function validateRegister(root:string,register:any):{rows:AssessmentReviewRecord[];issues:string[]}{
  const issues:string[]=[];
  if(register?.schema!==REVIEW_REGISTER_SCHEMA||!Array.isArray(register.records)) return {rows:[],issues:['REVIEW_REGISTER_INVALID']};
  const bank=readJson(root,'content-src/assessment-items.json');
  const byId=new Map(bank.items.map((i:any)=>[i.id,i]));
  const rows:AssessmentReviewRecord[]=[];
  for(const raw of register.records){
    if(raw?.decision===null||raw?.decision===undefined) continue;           // not reviewed — skipped, never defaulted
    const record={itemId:raw.itemId,role:raw.role,decision:raw.decision,reviewerId:raw.reviewerId,reviewerRole:raw.reviewerRole,reviewedAt:raw.reviewedAt,itemHash:raw.itemHash,itemVersion:raw.itemVersion,evidence:raw.evidence,...(raw.outcomeDecision!=null?{outcomeDecision:raw.outcomeDecision}:{}),...(raw.comment?{comment:String(raw.comment)}:{})} as AssessmentReviewRecord;
    const own=validateReviewRecord(record);
    issues.push(...own);
    const item:any=byId.get(record.itemId);
    if(!item){issues.push(`REVIEW_ITEM_UNKNOWN:${record.itemId}`);continue;}
    if(assessmentItemHash(item)!==record.itemHash) issues.push(`REVIEW_ITEM_HASH_STALE:${record.itemId}`);
    if(item.version!==record.itemVersion) issues.push(`REVIEW_ITEM_VERSION_STALE:${record.itemId}`);
    const packet=path.join(root,String(record.evidence?.packet??''));
    if(!record.evidence?.packet||!fs.existsSync(packet)) issues.push(`REVIEW_PACKET_MISSING:${record.itemId}`);
    else if(sha256(fs.readFileSync(packet))!==record.evidence.packetSha256) issues.push(`REVIEW_PACKET_CHANGED:${record.itemId}`);
    if(Date.parse(record.reviewedAt)>Date.now()+5*60*1000) issues.push(`REVIEW_TIMESTAMP_IN_FUTURE:${record.itemId}`);
    if(!own.length) rows.push(record);
  }
  return {rows,issues:[...new Set(issues)]};
}

/** Appends validated human decisions to the register. Existing records are never modified. */
export function importRegister(root:string,register:any){
  const {rows,issues}=validateRegister(root,register);
  if(issues.length) throw new Error(`ASSESSMENT_REVIEW_IMPORT_REJECTED: ${issues.join(', ')}`);
  const current=readJson(root,REGISTER_FILE);
  const key=(r:AssessmentReviewRecord)=>`${r.itemId}|${r.role}|${r.reviewerId}|${r.reviewedAt}|${r.itemHash}`;
  const seen=new Set((current.records??[]).map(key));
  const added=rows.filter(r=>!seen.has(key(r)));
  current.records=[...(current.records??[]),...added];
  fs.writeFileSync(path.join(root,REGISTER_FILE),`${JSON.stringify(current,null,2)}\n`,'utf8');
  return {imported:added.length,skippedUnreviewed:register.records.filter((r:any)=>r?.decision==null).length};
}
