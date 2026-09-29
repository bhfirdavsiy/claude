import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStableSignoffTargets} from './stable-signoff-targets.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outDir=path.join(root,'review-packets');
fs.mkdirSync(outDir,{recursive:true});
const targets=buildStableSignoffTargets(root).targets as Record<string,any>;
for(const [id,target] of Object.entries(targets)){
  const visual=id==='VISUAL-001';
  const record={
    gateId:id,
    status:'pending',
    reviewerId:'',
    reviewerRole:target.reviewerRole,
    reviewedVersion:target.version,
    reviewedHash:target.hash,
    reviewedAt:'',
    notes:visual&&!target.readyForReview
      ? 'DO NOT APPROVE YET: unrestricted browser screenshots are not available for the current production build.'
      : `Review ${id} evidence package before changing status to approved.`,
  };
  fs.writeFileSync(path.join(outDir,`${id}-approval-template.json`),`${JSON.stringify(record,null,2)}\n`,'utf8');
}
console.log(JSON.stringify({output:path.relative(root,outDir),templates:Object.keys(targets)}));
