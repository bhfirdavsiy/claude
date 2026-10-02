// P2.7 — accessibility sweep over EVERY launchable learner activity, through the real learner path in real Chromium:
// open → keyboard only (Tab / Shift+Tab / arrows / Space / Enter / typing) → empty input → wrong answer → retry →
// complete, then 320 / 375 px reflow, 200 % zoom, 200 % text, 44 px targets and prefers-reduced-motion on the
// finished state. Portal host (/kimyolab/) for all activities; the standalone single file for one representative per
// UI family, whose results must be IDENTICAL to the portal (no host-specific accessibility behaviour).
//
// The browser facts are committed in reports/accessibility-browser-evidence.json. This spec RE-MEASURES them on every
// `npm run verify` and fails on any difference, so the committed accessibility states can never drift from what the
// browser shows. `A11Y_WRITE=1` (npm run a11y:sweep) rewrites the evidence file after a deliberate change.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test, expect} from '@playwright/test';
import {repoRoot} from '../helpers/dist.mjs';
import {startHosts} from './host-scenarios.mjs';
import {auditActivity} from '../helpers/a11y-flow.mjs';

const EVIDENCE = path.join(repoRoot, 'reports', 'accessibility-browser-evidence.json');
const WRITE = process.env.A11Y_WRITE === '1';
const CONCURRENCY = 4;
test.setTimeout(20 * 60_000);

function plans() {
  const r = spawnSync(process.execPath, ['--no-warnings', 'scripts/accessibility-plan.ts'], {cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.status !== 0) throw new Error(`accessibility-plan failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

async function pool(items, worker) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length: CONCURRENCY}, async () => { while (next < items.length) { const i = next++; out[i] = await worker(items[i]); } }));
  return out;
}

test('every launchable activity: keyboard real flow, semantics, reflow, reduced motion — portal + standalone parity', async ({browser}) => {
  const all = plans();
  const launchable = all.filter((p) => p.launchable);
  const hosts = await startHosts();
  try {
    const audit = (host) => async (plan) => {
      const context = await browser.newContext({bypassCSP: true});
      const page = await context.newPage();
      try { return {activityId: plan.activityId, ...(await auditActivity(page, host.open, plan))}; } finally { await context.close(); }
    };
    const portal = await pool(launchable, audit(hosts.portal));
    const families = [...new Set(launchable.map((p) => p.family))];
    const representatives = families.map((f) => launchable.find((p) => p.family === f));
    const standalone = await pool(representatives, audit(hosts.standalone));
    const evidence = {
      schema: 'kimyolab.accessibility-browser-evidence.v1',
      semantics: 'Browser facts measured by tests/e2e/accessibility-sweep.spec.mjs (real Chromium, keyboard only). Automated technical verification only — NOT a human accessibility review.',
      method: {portal: '/kimyolab/ portal simulation, every launchable activity', standalone: 'dist-standalone/KimyoLab_standalone.html, one representative per UI family', viewports: {desktop: 1280, reflow: [320, 375], zoom200: '640 CSS px (= 200 % zoom of a 1280 px window)', textScale: 'root font-size 200 %'}, targetSize: '44 CSS px (product convention: 44 px option/button height)'},
      activities: portal.map((r) => { const plan = launchable.find((p) => p.activityId === r.activityId); return {...r, family: plan.family, ...(plan.emptyNotApplicable ? {emptyNotApplicable: plan.emptyNotApplicable} : {})}; }),
      notLaunchable: all.filter((p) => !p.launchable).map((p) => ({activityId: p.activityId, reason: p.reason})),
      standaloneParity: standalone.map((s) => {
        const p = portal.find((x) => x.activityId === s.activityId);
        return {activityId: s.activityId, family: launchable.find((x) => x.activityId === s.activityId).family, identical: JSON.stringify(p.checks) === JSON.stringify(s.checks) && JSON.stringify(p.issues) === JSON.stringify(s.issues), standalone: {checks: s.checks, issues: s.issues}};
      }),
    };
    if (WRITE) fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
    const committed = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
    // no host-specific accessibility behaviour
    expect(evidence.standaloneParity.filter((x) => !x.identical).map((x) => x.activityId)).toEqual([]);
    // the committed browser facts are exactly what the browser shows today
    expect(evidence.activities).toEqual(committed.activities);
    expect(evidence.notLaunchable).toEqual(committed.notLaunchable);
    expect(evidence.standaloneParity).toEqual(committed.standaloneParity);
  } finally { await hosts.close(); }
});
