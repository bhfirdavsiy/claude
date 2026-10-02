// ci:environment (P2.8) — records the REAL environment of this run (runner OS image, Node, npm, Playwright, Chromium)
// into reports/ci-environment.observed.json (uploaded by CI, not committed: it describes one machine) and fails when
// the application Node major differs from kimyolab/.nvmrc. On GitHub Actions the facts also go to the job summary.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (cmd) => { try { return execSync(cmd, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch { return null; } };
const osRelease = (() => { try { return Object.fromEntries(fs.readFileSync('/etc/os-release', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })); } catch { return null; } })();
const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
let chromium = null;
if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD !== '1') {
  try { const {chromium: c} = await import('@playwright/test'); const b = await c.launch(); chromium = b.version(); await b.close(); } catch { chromium = null; }
}
const observed = {
  schema: 'kimyolab.ci-environment.observed.v1',
  semantics: 'The environment of ONE run (not committed). The committed, deterministic declaration is reports/ci-reproducibility.json.',
  runner: {platform: process.platform, arch: process.arch, osRelease: os.release(), distribution: osRelease ? `${osRelease.NAME ?? ''} ${osRelease.VERSION ?? ''}`.trim() : null, githubRunnerOs: process.env.RUNNER_OS ?? null, imageOs: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, githubActions: process.env.GITHUB_ACTIONS === 'true'},
  node: process.version, nvmrc, npm: read('npm --version'),
  playwright: JSON.parse(fs.readFileSync(path.join(root, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')).version,
  chromium,
};
fs.mkdirSync(path.join(root, 'reports'), {recursive: true});
fs.writeFileSync(path.join(root, 'reports', 'ci-environment.observed.json'), `${JSON.stringify(observed, null, 2)}\n`);
console.log(JSON.stringify(observed));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### KimyoLab CI environment\n\n| fact | value |\n|---|---|\n${Object.entries({os: `${observed.runner.imageOs ?? observed.runner.platform} ${observed.runner.imageVersion ?? ''} ${observed.runner.distribution ?? ''}`.trim(), node: observed.node, nvmrc, npm: observed.npm, playwright: observed.playwright, chromium: observed.chromium ?? '(not installed in this job)'}).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n`);
if (process.version.replace(/^v/, '').split('.')[0] !== nvmrc.replace(/^v/, '').split('.')[0]) {
  console.error(`CI_NODE_VERSION_MISMATCH: running Node ${process.version} but kimyolab/.nvmrc says ${nvmrc}. Fix the setup-node step (node-version-file: kimyolab/.nvmrc).`);
  process.exitCode = 1;
}
