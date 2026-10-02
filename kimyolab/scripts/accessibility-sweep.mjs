// a11y:sweep (P2.7) — re-measures every launchable activity in real Chromium and REWRITES the committed browser facts
// (reports/accessibility-browser-evidence.json), then regenerates the accessibility reports. Use after a deliberate
// UI change; `npm run verify` re-measures in compare mode and fails on any difference. Cross-platform (no shell env).
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(root,'node_modules','@playwright','test','cli.js');
const sweep=spawnSync(process.execPath,[cli,'test','-c','playwright.config.mjs','tests/e2e/accessibility-sweep.spec.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,A11Y_WRITE:'1'}});
if(sweep.status!==0) process.exit(sweep.status??1);
const report=spawnSync(process.execPath,['scripts/accessibility-verification.ts'],{cwd:root,stdio:'inherit'});
process.exit(report.status??1);
