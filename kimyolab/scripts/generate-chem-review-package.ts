import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStableSignoffTargets} from './stable-signoff-targets.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target:any=buildStableSignoffTargets(root).targets['CHEM-033'];
const out=path.join(root,'docs/approvals/CHEM-033-review-package.md');
const files=(target.reviewSurfaceFiles??[]) as string[];
const chemistryFiles=files.filter(x=>x.startsWith('content-src/chemistry/'));
const runtimeFiles=files.filter(x=>x.startsWith('content-src/activity-configs/'));
const lines=[
  '# CHEM-033 Chemistry Reviewer Package',
  '',
  '**Status:** PENDING EXTERNAL CHEMISTRY REVIEW  ',
  `**Review version:** \`${target.version}\`  `,
  `**Review target SHA-256:** \`${target.hash}\`  `,
  `**Review-surface schema:** \`${target.reviewSurfaceSchema}\`  `,
  `**Files covered by approval hash:** ${target.reviewSurfaceFileCount}`,
  '',
  '## What this approval covers',
  '',
  'CHEM-033 is fail-closed. The approval hash covers both canonical chemistry knowledge and the runtime activity configurations that can change how that chemistry is presented or executed. Any byte-level semantic JSON change to this review surface produces a new target hash; an older approval then becomes `APPROVAL_HASH_STALE`.',
  '',
  '### Canonical chemistry knowledge',
  '',
  ...chemistryFiles.map(x=>`- \`${x}\``),
  '',
  '### Chemistry-relevant runtime activity configurations',
  '',
  ...runtimeFiles.map(x=>`- \`${x}\``),
  '',
  '## School-equation corpus',
  '',
  '- Corpus: `tests/chemistry-corpus/school-review-candidates.json`',
  '- Review sheet: `reports/CHEM-033-school-equations-review.csv`',
  '- Technical balance is not chemical validity; the reviewer must validate chemistry, conditions, observations, safety and grade appropriateness.',
  '',
  '## Approval procedure',
  '',
  '1. Review the exact files listed above plus the school-equation corpus.',
  '2. Resolve any `reject`/`revise` decisions before approval.',
  '3. Use `review-packets/CHEM-033-approval-template.json` generated from the same target.',
  '4. Fill a real reviewer ID, keep role `Chemistry Reviewer`, set `reviewedAt`, and change status to `approved` only after review.',
  '5. Do not edit `reviewedVersion` or `reviewedHash`; they must match the generated target exactly.',
  '',
  '## Acceptance rule',
  '',
  'CHEM-033 closes only when the external approval record matches the current version, reviewer role and review target hash. Any later chemistry/relevant-runtime change invalidates the old approval automatically.',
  '',
];
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,lines.join('\n'),'utf8');
console.log(JSON.stringify({output:path.relative(root,out),version:target.version,hash:target.hash,fileCount:target.reviewSurfaceFileCount}));
