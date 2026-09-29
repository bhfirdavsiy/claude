import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeReviewHash,effectiveApprovalState} from '../src/runtime/governance/approvals.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const units=read('content-src/learning-units.json');
const practices=read('content-src/practice-activities.json');
const mappings=read('content-src/mapping-links.json');
const practiceMap=new Map(practices.map((x:any)=>[x.id,x]));
const unitMap=new Map(units.map((x:any)=>[x.id,x]));
const betaDefs:any={BETA1:[7,8],BETA2:[9,10],BETA3:[11]};

function build(beta:string,grades:number[]){
  const byPractice=new Map<string,{practice:any,unitIds:string[],legacyIds:string[],titles:string[]}>();
  for(const m of mappings){
    if(m.role!=='primary') continue;
    const u:any=unitMap.get(m.learningUnitId); if(!u||!grades.includes(u.grade)) continue;
    const p:any=practiceMap.get(m.practiceActivityId); if(!p) continue;
    const row=byPractice.get(p.id)??{practice:p,unitIds:[],legacyIds:[],titles:[]};
    row.unitIds.push(u.id); row.legacyIds.push(u.legacyIds?.[0]??''); row.titles.push(u.title); byPractice.set(p.id,row);
  }
  const records:any[]=[];
  for(const row of [...byPractice.values()].sort((a,b)=>a.practice.id.localeCompare(b.practice.id))){
    const p=row.practice; const state=effectiveApprovalState(p); const hash=computeReviewHash(p);
    for(const type of ['technical','didactic','accessibility','chemistry']){
      const current=(state as any)[type];
      if(current==='not_applicable') continue;
      records.push({
        beta,learningUnitIds:row.unitIds,legacyIds:row.legacyIds,titles:row.titles,
        practiceActivityId:p.id,practiceTitle:p.title,practiceType:p.type,approvalType:type,
        status:current.status,reviewerId:'',reviewerRole:type,reviewedVersion:p.version,reviewedHash:hash,reviewedAt:'',notes:''
      });
    }
  }
  return {schema:'kimyolab.beta-approval-register.v1',generatedAt:new Date().toISOString(),beta,grades,records};
}

fs.mkdirSync(path.join(root,'review-packets'),{recursive:true});
const summary:any={};
for(const [beta,grades] of Object.entries(betaDefs)){
  const register=build(beta,grades as number[]);
  const out=`review-packets/${beta.toLowerCase()}-approval-register.json`;
  fs.writeFileSync(path.join(root,out),`${JSON.stringify(register,null,2)}\n`,'utf8');
  summary[beta]={records:register.records.length,file:out};
}
console.log(JSON.stringify(summary));
