// P2.8 — installation readiness: one configuration surface, a fail-closed preflight with actionable codes, a known
// artefact, pinned CI, and a separate metric that never touches the learning-product formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveDeployConfig, mountDirName, deployPaths, rel, DEPLOY_SETTINGS, DEFAULT_DEPLOY_BASE_PATH} from '../scripts/lib/deploy-config.ts';
import {buildDeployArtifact} from '../scripts/deploy-build.ts';
import {runPreflight, PREFLIGHT_CHECKS} from '../scripts/deploy-preflight.ts';
import {readWorkflows, workflowFindings, VERIFIED_ACTIONS, PINNED_RUNNERS} from '../scripts/lib/ci-workflow.ts';
import {computeTreeHash} from '../scripts/deploy-surface-hash.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

// one fresh artefact for the whole file (tests never depend on a dist-deploy left over from another command)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kl-p28-'));
const config = resolveDeployConfig({});
const manifest = buildDeployArtifact(config, path.join(tmp, 'base'));
fs.writeFileSync(path.join(tmp, 'base.manifest.json'), JSON.stringify(manifest));
test.after(() => fs.rmSync(tmp, {recursive: true, force: true}));

function variant(name, mutate, env = {}) {
  const dir = path.join(tmp, name); fs.cpSync(path.join(tmp, 'base'), dir, {recursive: true});
  mutate?.(dir);
  return runPreflight({root, env, artifactDir: dir, manifestFile: path.join(tmp, 'base.manifest.json'), rebuild: false});
}
const failing = (r) => r.checks.filter((c) => !c.pass).map((c) => c.code);

test('config: one input (the mount); everything else derived; invalid input fails closed with an actionable code', () => {
  assert.equal(DEFAULT_DEPLOY_BASE_PATH, '/kimyolab/');
  assert.deepEqual(resolveDeployConfig({}), {basePath: '/kimyolab/', portalHomeUrl: null, assetBase: '/kimyolab/', contentBase: '/kimyolab/content', apiBase: '/kimyolab/api/', storageNamespace: 'kimyolab@/kimyolab/', indexedDbName: 'kimyolab@/kimyolab/.runtime', webLockPrefix: 'kimyolab@/kimyolab/.attempt.', mountDir: 'kimyolab'});
  for (const bad of ['../x', 'kimyolab', '/a//b/', '/a/../b/', '/<x>/']) assert.throws(() => resolveDeployConfig({KIMYOLAB_BASE_PATH: bad}), (e) => e.code === 'DEPLOY_BASE_PATH_INVALID' && /\/kimyolab\//.test(e.hint), bad);
  assert.throws(() => resolveDeployConfig({KIMYOLAB_PORTAL_HOME_URL: 'javascript:alert(1)'}), (e) => e.code === 'DEPLOY_PORTAL_HOME_INVALID');
  assert.equal(resolveDeployConfig({KIMYOLAB_PORTAL_HOME_URL: 'https://portal.example/'}).portalHomeUrl, 'https://portal.example/');
  assert.equal(mountDirName('/a/b/'), 'a/b'); assert.equal(mountDirName('/'), 'root');
  // Windows paths: the upload folder is built with path.join, never a hard-coded separator
  assert.equal(deployPaths(root, '/a/b/').artifact, path.join(root, 'dist-deploy', 'a', 'b'));
  for (const s of DEPLOY_SETTINGS) assert.ok(s.name && s.kind && s.supply && s.default && s.consumers.length, s.name);
});

test('operator output never names an absolute path of the machine', () => {
  assert.equal(rel(root, path.join(root, 'dist-deploy', 'kimyolab')), 'dist-deploy/kimyolab');
  assert.equal(rel(root, path.join(os.tmpdir(), 'x', 'artifact')), '<outside the repository>/x/artifact');
  const r = variant('abs', (d) => fs.rmSync(path.join(d, 'content', 'manifest.json')));
  assert.ok(!JSON.stringify(r).includes(tmp), 'the temp directory is not printed');
  assert.ok(!JSON.stringify(r).includes(os.homedir() + path.sep));
});

test('deploy artefact: deterministic, every file hashed, mount and content version recorded, no build-only file', () => {
  const again = buildDeployArtifact(config, path.join(tmp, 'again'));
  assert.equal(again.sha256, manifest.sha256, 'same commit + inputs → same bytes');
  assert.equal(manifest.fileCount, computeTreeHash(path.join(tmp, 'base')).fileCount);
  assert.equal(manifest.files.length, manifest.fileCount);
  assert.ok(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  assert.equal(manifest.mount, '/kimyolab/'); assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.content.contentVersion, json('public/content/manifest.json').activeVersion);
  assert.ok(!manifest.files.some((f) => f.path === 'app.html' || /\.(ts|mjs|md|map)$/.test(f.path)));
  assert.match(fs.readFileSync(path.join(tmp, 'base', 'index.html'), 'utf8'), /<meta name="kimyolab-base-path" content="\/kimyolab\/">/);
});

test('preflight passes on the built artefact and publishes every check', () => {
  const r = runPreflight({root, env: {}, artifactDir: path.join(tmp, 'base'), manifestFile: path.join(tmp, 'base.manifest.json'), rebuild: true});
  assert.equal(r.status, 'PASS', JSON.stringify(r.checks.filter((c) => !c.pass)));
  assert.deepEqual(r.checks.map((c) => c.id), [...PREFLIGHT_CHECKS]);
});

test('preflight fails closed, with a DEPLOY_* code and a fix, for each deployment defect', () => {
  const cases = {
    'missing content manifest': [variant('m1', (d) => fs.rmSync(path.join(d, 'content', 'manifest.json'))), 'DEPLOY_CONTENT_MANIFEST_MISSING'],
    'edited file': [variant('m2', (d) => fs.appendFileSync(path.join(d, 'app-preview', 'app', 'bootstrap.js'), '\n// edit')), 'DEPLOY_CHECKSUM_MISMATCH'],
    'wrong mount': [variant('m3', null, {KIMYOLAB_BASE_PATH: '/other/'}), 'DEPLOY_BASE_PATH_INVALID'],
    'root asset leak': [variant('m4', (d) => fs.appendFileSync(path.join(d, 'index.html'), '<img src="/leak.png">')), 'DEPLOY_ASSET_BASE_INVALID'],
    'external script': [variant('m5', (d) => fs.appendFileSync(path.join(d, 'index.html'), '<script src="https://cdn.example.invalid/x.js"></script>')), 'DEPLOY_EXTERNAL_DEPENDENCY'],
    'service worker': [variant('m6', (d) => fs.writeFileSync(path.join(d, 'sw.js'), 'self.addEventListener("fetch",()=>{})')), 'DEPLOY_SERVICE_WORKER_PRESENT'],
    'forbidden file': [variant('m7', (d) => fs.writeFileSync(path.join(d, '.env'), 'X=1')), 'DEPLOY_FORBIDDEN_FILE'],
    'namespace collision': [variant('m8', null, {KIMYOLAB_CO_HOSTED_MOUNTS: '/kimyolab'}), 'DEPLOY_STORAGE_NAMESPACE_COLLISION'],
    'config mismatch': [variant('m9', null, {KIMYOLAB_PORTAL_HOME_URL: 'https://portal.example/'}), 'DEPLOY_CONFIG_MISMATCH'],
    'brand replaced': [variant('m10', (d) => fs.writeFileSync(path.join(d, 'assets', 'brand', 'kimyolab-logo.webp'), 'x')), 'DEPLOY_BRAND_ASSET_MISMATCH'],
    'incomplete build': [variant('m11', (d) => fs.rmSync(path.join(d, 'app-preview', 'app', 'bootstrap.js'))), 'DEPLOY_BUILD_INCOMPLETE'],
    'invalid config': [variant('m12', null, {KIMYOLAB_BASE_PATH: '../x'}), 'DEPLOY_BASE_PATH_INVALID'],
  };
  for (const [name, [r, code]] of Object.entries(cases)) {
    assert.equal(r.status, 'FAIL', name);
    assert.ok(failing(r).includes(code), `${name}: expected ${code}, got ${failing(r)}`);
    for (const c of r.checks.filter((x) => !x.pass)) { assert.match(c.code, /^DEPLOY_[A-Z_]+$/); assert.ok(c.fix.length > 10 && c.message.length > 10, `${name}/${c.id}`); }
  }
  // read-only: the preflight never repairs the artefact
  const before = computeTreeHash(path.join(tmp, 'm2')).sha256;
  runPreflight({root, env: {}, artifactDir: path.join(tmp, 'm2'), manifestFile: path.join(tmp, 'base.manifest.json'), rebuild: false});
  assert.equal(computeTreeHash(path.join(tmp, 'm2')).sha256, before);
});

test('CI: verification OS pinned, actions on their Node-24 majors, application Node only from .nvmrc', () => {
  const jobs = readWorkflows(path.resolve(root, '..'));
  const f = workflowFindings(jobs);
  assert.deepEqual([f.linuxPinned, f.windowsPinned, f.noFloatingRunner, f.actionsOnNode24, f.appNodeFromNvmrc], [true, true, true, true, true], JSON.stringify(f));
  assert.deepEqual(PINNED_RUNNERS, {linux: 'ubuntu-24.04', windows: 'windows-2025'});
  assert.ok(Object.values(VERIFIED_ACTIONS).every((a) => a.ref === 'v7' && a.runtime === 'node24'));
  const all = fs.readdirSync(path.resolve(root, '../.github/workflows')).map((x) => fs.readFileSync(path.resolve(root, '../.github/workflows', x), 'utf8')).join('\n');
  assert.doesNotMatch(all, /ubuntu-latest|windows-latest|@v4\b/);
  // a floating label or an old action is reported, not tolerated
  const bad = workflowFindings([{workflow: 'kimyolab-verify.yml', job: 'verify', runsOn: 'ubuntu-latest', uses: ['actions/checkout@v4', 'actions/setup-node@v4'], nodeVersionFile: [], nodeVersion: ['20']}]);
  assert.deepEqual([bad.linuxPinned, bad.noFloatingRunner, bad.actionsOnNode24, bad.appNodeFromNvmrc], [false, false, false, false]);
  assert.equal(fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(), '22', 'the application Node major is unchanged');
});

test('Installation Readiness: published checks, honest status, separate from the learning-product formula', () => {
  const r = json('reports/installation-readiness.json');
  assert.equal(r.total, r.checks.length); assert.equal(r.passed, r.checks.filter((c) => c.pass).length);
  assert.equal(r.percent, Math.round(1000 * r.passed / r.total) / 10);
  assert.ok(r.total >= 20);
  for (const c of r.checks) assert.ok(c.id && c.label && c.evidence, c.id);
  assert.equal(r.status, r.passed < r.total ? 'NOT_READY' : r.externalAcceptance.records ? 'READY_FOR_DEPLOYMENT' : 'READY_IN_SIMULATION');
  assert.equal(r.externalAcceptance.records, 0, 'no real target-server acceptance exists; none is fabricated');
  assert.notEqual(r.status, 'READY_FOR_DEPLOYMENT');
  const p = json('reports/project-progress.json');
  assert.deepEqual([p.foundationProgress.percent, p.learningProductProgress.percent, p.overallManagementEstimate.percent], [100, 12.189, 47.313]);
  assert.ok(!JSON.stringify(p.learningProductProgress.weights).includes('install'));
  assert.ok(!JSON.stringify(p.overallManagementEstimate.weights).includes('install'));
});

test('reports: config audit clean, artefacts explicit, rollback kept learner evidence, clean drill used the documented commands', () => {
  const audit = json('reports/deployment-config-audit.json');
  assert.equal(audit.status, 'PASS', audit.violations.join('; '));
  assert.ok(audit.hostLiterals.every((h) => h.allowed));
  assert.deepEqual(audit.deploymentPathLiterals, []);
  const art = json('reports/deployment-artifacts.json');
  assert.equal(art.production.requiredServerMount, '/kimyolab/'); assert.equal(art.production.outputPath, 'dist-deploy/kimyolab/');
  assert.match(art.production.sha256, /^[0-9a-f]{64}$/); assert.match(art.standalone.sha256, /^[0-9a-f]{64}$/);
  assert.equal(art.learnerBundle.after.learnerModules, art.learnerBundle.before.learnerModules, 'no learner module added by installation tooling');
  const rb = json('reports/deployment-rollback-drill.json');
  assert.equal(rb.status, 'PASS'); assert.notEqual(rb.previous.sha256, rb.current.sha256, 'a real previous artefact, not a copy');
  for (const id of ['evidence-kept-after-rollback', 'evidence-kept-after-restore', 'previous-smoke', 'restored-smoke']) assert.ok(rb.steps.find((s) => s.id === id)?.pass, id);
  const drill = json('reports/deployment-clean-drill.json');
  assert.equal(drill.status, 'PASS');
  assert.deepEqual(drill.commands, ['npm ci', 'npm run deploy:build', 'npm run deploy:preflight', 'npm run deploy:smoke']);
  const guide = fs.readFileSync(path.join(root, 'docs/DEPLOY.md'), 'utf8');
  for (const c of drill.commands) assert.ok(guide.includes(c), `DEPLOY.md documents "${c}"`);
});
