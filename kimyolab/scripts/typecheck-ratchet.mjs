// Strictness ratchet (P0.3): `strict` + `noImplicitAny` are enforced by `npm run typecheck`.
// The next flag (noUncheckedIndexedAccess) is migrated incrementally: the error count may only go down.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = path.join(root, 'config', 'typecheck-ratchet.json');
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json', ...baseline.flags], {cwd: root, encoding: 'utf8'});
const errors = (r.stdout.match(/error TS\d+/g) ?? []).length;
console.log(JSON.stringify({flags: baseline.flags, errors, baseline: baseline.maxErrors}));
if (errors > baseline.maxErrors) { console.error(`TYPECHECK_RATCHET_REGRESSION: ${errors} > ${baseline.maxErrors}`); process.exitCode = 1; }
else if (errors < baseline.maxErrors && process.argv.includes('--update')) { fs.writeFileSync(baselineFile, JSON.stringify({...baseline, maxErrors: errors}, null, 2) + '\n'); console.log('baseline lowered'); }
