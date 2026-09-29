import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('guided-lab engineering triage partitions all 27 guided labs without inventing reaction refs',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(root,'reports/guided-lab-triage.json'),'utf8'));
  assert.equal(report.classification,'engineering-triage-not-expert-approval');
  assert.deepEqual(report.summary,{total:27,proceduralGuided:8,reactionKbPartial:11,domainModelRequired:0,domainModelBaselined:8,unclassified:0,candidateReactionRefs:23,missingReactionRefs:0,reactionGroundedLabs:10,reactionGroundedSteps:19,chemistryGroundedLabs:19,chemistryGroundedSteps:47,modelGroundedSteps:30});
  assert.equal(new Set(report.rows.map(x=>x.id)).size,27);
});
