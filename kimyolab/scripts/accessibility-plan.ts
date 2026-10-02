// P2.7 — prints the accessibility flow plans (scripts/lib/accessibility-plan.ts) as JSON on stdout for the browser
// sweep (tests/e2e/accessibility-sweep.spec.mjs). Never written to disk: the plans contain the success path.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildAccessibilityPlans} from './lib/accessibility-plan.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.stdout.write(JSON.stringify(await buildAccessibilityPlans(root)));
