import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStableSignoffTargets} from './stable-signoff-targets.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target:any=buildStableSignoffTargets(root).targets['PROD-002'];
const out=path.join(root,'docs/approvals/PROD-002-review-package.md');
const files=(target.reviewSurfaceFiles??[]) as string[];
const lines=[
'# PROD-002 Didactic Reviewer Package','',
'**Status:** PENDING EXTERNAL DIDACTIC REVIEW  ',
`**Review version:** \`${target.version}\`  `,
`**Review target SHA-256:** \`${target.hash}\`  `,
`**Review-surface schema:** \`${target.reviewSurfaceSchema}\`  `,
`**Files covered by approval hash:** ${target.reviewSurfaceFileCount}`,'',
'## What this approval covers','',
'PROD-002 covers the canonical learner-facing curriculum flow, theory/practice definitions, mappings, external-lab bindings and runtime activity configurations. Any semantic JSON change in this surface changes the target hash and invalidates an older didactic approval.','',
'## Exact review surface','',...files.map(x=>`- \`${x}\``),'',
'## Reviewer checks','',
'1. Learning outcomes, theory, practice and assessment form a coherent learning sequence.',
'2. Activity type and difficulty are appropriate for the stated grade and concept.',
'3. External lab links are pedagogically supplemental and do not bypass local assessment/mastery.',
'4. Guided/engine activities provide meaningful evidence rather than completion-only signals.',
'5. Technical/internal metadata is not exposed as learner-facing instructional content.','',
'## Approval procedure','',
'1. Review the exact files listed above and representative end-to-end learner flows.',
'2. Use `review-packets/PROD-002-approval-template.json` generated from the same target.',
'3. Fill a real reviewer ID/date and set status to `approved` only after review.',
'4. Do not edit `reviewedVersion` or `reviewedHash`; they must match the generated target.','',
'## Acceptance rule','',
'PROD-002 closes only when the external approval record matches the current content version, reviewer role and didactic review target hash. Any later learner-flow/configuration change invalidates the old approval automatically.',''
];
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,lines.join('\n'),'utf8');
console.log(JSON.stringify({output:path.relative(root,out),version:target.version,hash:target.hash,fileCount:target.reviewSurfaceFileCount}));
