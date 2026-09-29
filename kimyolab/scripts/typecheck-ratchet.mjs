// Strictness ratchet (P0.3 / P0.15.1): `strict` + `noImplicitAny` are enforced by `npm run typecheck`.
// The next flag (noUncheckedIndexedAccess) is migrated incrementally: the error count may only go down.
//   npm run typecheck:next              → fails if errors > baseline
//   npm run typecheck:next -- --update  → lowers the baseline after debt was paid
//   --project <tsconfig>                → check another project (used by the acceptance test)
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const project = argv.includes('--project') ? path.resolve(argv[argv.indexOf('--project') + 1]) : path.join(root, 'tsconfig.json');
const baselineFile = path.join(root, 'config', 'typecheck-ratchet.json');
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', project, ...baseline.flags], {cwd: root, encoding: 'utf8'});
const errors = (r.stdout.match(/error TS\d+/g) ?? []).length;
if (r.status !== 0 && errors === 0) { console.error(`TYPECHECK_RATCHET_TSC_FAILED\n${r.stdout}${r.stderr}`); process.exit(1); }
console.log(JSON.stringify({flags: baseline.flags, errors, baseline: baseline.maxErrors}));
if (errors > baseline.maxErrors) {
  console.error(`TYPECHECK_RATCHET_REGRESSION: ${errors} > ${baseline.maxErrors} (${baseline.flags.join(' ')}). New code must not add unchecked indexed access.`);
  process.exitCode = 1;
} else if (errors < baseline.maxErrors) {
  if (argv.includes('--update')) { fs.writeFileSync(baselineFile, JSON.stringify({...baseline, maxErrors: errors}, null, 2) + '\n'); console.log(`baseline lowered ${baseline.maxErrors} → ${errors}`); }
  else console.log(`debt reduced to ${errors}; run "npm run typecheck:next -- --update" to lock it in`);
}
