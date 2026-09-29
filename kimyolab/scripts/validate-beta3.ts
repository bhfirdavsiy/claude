import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBeta3ReadinessReport} from '../src/runtime/beta3/readiness.ts';
import {loadBeta1ConfigRegistry} from '../src/runtime/beta1/config.ts';
import {loadBeta3AdvancedRegistry} from '../src/runtime/beta3/advanced.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p:string)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const matrix=read('content-src/beta3-capability-matrix.json');
const configRegistry={
  ...loadBeta1ConfigRegistry(read('content-src/activity-configs/beta3-safe.json')),
  ...loadBeta3AdvancedRegistry(read('content-src/activity-configs/beta3-advanced.json')),
};
const readiness=buildBeta3ReadinessReport({
  units:read('content-src/learning-units.json'),
  practices:read('content-src/practice-activities.json'),
  mappings:read('content-src/mapping-links.json'),
  matrix,
  configRegistry,
});
const technicalErrors=readiness.rows.filter(r=>r.disposition==='existing-engine'&&!r.technicalReady).length;
const pendingApprovals=readiness.rows.filter(r=>r.technicalReady).reduce((sum,row)=>sum+row.approvalPending.length,0);
const output={
  generatedAt:new Date().toISOString(),
  totalLearningUnits:readiness.totalLearningUnits,
  technicalReady:readiness.technicalReady,
  releaseReady:readiness.releaseReady,
  technicalErrors,
  pendingApprovals,
  blocked:{
    total:readiness.totalLearningUnits-readiness.technicalReady,
    byDisposition:readiness.blockedByDisposition,
  },
  rows:readiness.rows,
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/beta3-readiness.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');
console.log(JSON.stringify({totalLearningUnits:output.totalLearningUnits,technicalReady:output.technicalReady,releaseReady:output.releaseReady,technicalErrors:output.technicalErrors,blocked:output.blocked.total,pendingApprovals:output.pendingApprovals}));
if(technicalErrors>0) process.exitCode=1;
