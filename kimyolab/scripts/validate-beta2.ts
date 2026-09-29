import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBeta2ReadinessReport} from '../src/runtime/beta2/readiness.ts';
import {loadBeta2CapabilityMatrix,summarizeBeta2Capabilities} from '../src/runtime/beta2/capability.ts';
import {loadBeta1ConfigRegistry} from '../src/runtime/beta1/config.ts';
import {loadBeta2AdvancedRegistry} from '../src/runtime/beta2/advanced.ts';
import {loadBeta2OrganicRegistry} from '../src/runtime/beta2/organic.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p:string)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const matrix=loadBeta2CapabilityMatrix(read('content-src/beta2-capability-matrix.json'));
const configs={...loadBeta1ConfigRegistry(read('content-src/activity-configs/beta2-safe.json')),...loadBeta2AdvancedRegistry(read('content-src/activity-configs/beta2-advanced.json')),...loadBeta2OrganicRegistry(read('content-src/activity-configs/beta2-organic.json'))};
const readiness=buildBeta2ReadinessReport({
  units:read('content-src/learning-units.json'),
  practices:read('content-src/practice-activities.json'),
  mappings:read('content-src/mapping-links.json'),
  matrix,
  configRegistry:configs,
});
const technicalErrors=readiness.rows.filter(r=>r.disposition==='existing-engine'&&!r.technicalReady).length;
const pendingApprovals=readiness.rows.filter(r=>r.technicalReady).reduce((sum,row)=>sum+row.approvalPending.length,0);
const summary=summarizeBeta2Capabilities(matrix);
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
    capabilities:summary.capabilities,
  },
  rows:readiness.rows,
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/beta2-readiness.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');
fs.writeFileSync(path.join(root,'reports/beta2-capability-summary.json'),`${JSON.stringify(summary,null,2)}\n`,'utf8');
console.log(JSON.stringify({totalLearningUnits:output.totalLearningUnits,technicalReady:output.technicalReady,releaseReady:output.releaseReady,technicalErrors:output.technicalErrors,blocked:output.blocked.total,pendingApprovals:output.pendingApprovals}));
if(technicalErrors>0) process.exitCode=1;
