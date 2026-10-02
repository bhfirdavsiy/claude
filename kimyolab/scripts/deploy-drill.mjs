// deploy:drill (P2.8) — clean-environment installation drill. Approximates a fresh machine:
//   * a new directory holding ONLY the repository's files (tracked + new, never ignored ones: no node_modules, no dist,
//     no dist-deploy, no local reports of a previous run);
//   * a fresh HOME and npm prefix (no global npm package can be used), PATH = the Node directory + the OS base dirs;
//   * exactly the documented commands of docs/DEPLOY.md, in order;
//   * then: the generated files must be byte-identical to the committed ones and the artefact may not contain any
//     absolute path of the machine that built it.
// The browsers for the smoke come from the declared Playwright install (PLAYWRIGHT_BROWSERS_PATH / CHROME_BIN).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {computeTreeHash} from './deploy-surface-hash.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The documented install sequence (docs/DEPLOY.md §2). Changing it here means changing the guide. */
export const DRILL_COMMANDS = [['npm', 'ci'], ['npm', 'run', 'deploy:build'], ['npm', 'run', 'deploy:preflight'], ['npm', 'run', 'deploy:smoke']];
const PASS_THROUGH = ['PLAYWRIGHT_BROWSERS_PATH', 'CHROME_BIN', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'npm_config_cafile', 'KIMYOLAB_BASE_PATH', 'SystemRoot', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'];

const started = Date.now();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kimyolab-clean-drill-'));
const work = path.join(tmp, 'kimyolab');
const steps = [];
let status = 'FAIL'; let code = null; let message = null;
try {
  // 1. only repository files
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: root, encoding: 'utf8'});
  if (listed.status !== 0) throw Object.assign(new Error('git ls-files failed: run the drill from a git checkout'), {code: 'DEPLOY_DRILL_SOURCE_MISSING'});
  const files = listed.stdout.split('\0').filter(Boolean).filter((f) => fs.existsSync(path.join(root, f)));
  for (const f of files) { const to = path.join(work, f); fs.mkdirSync(path.dirname(to), {recursive: true}); fs.copyFileSync(path.join(root, f), to); }
  const generatedBefore = computeTreeHash(path.join(work, 'public')).sha256;
  steps.push({id: 'repository-files-only', pass: !fs.existsSync(path.join(work, 'node_modules')) && !fs.existsSync(path.join(work, 'dist-deploy')), detail: {files: files.length}});

  // 2. a clean environment
  const home = path.join(tmp, 'home'); fs.mkdirSync(home);
  const nodeDir = path.dirname(process.execPath);
  const basePath = process.platform === 'win32' ? [nodeDir, `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32`, process.env.SystemRoot ?? 'C:\\Windows'] : [nodeDir, '/usr/local/bin', '/usr/bin', '/bin'];
  const env = {PATH: basePath.join(path.delimiter), HOME: home, USERPROFILE: home, npm_config_prefix: path.join(home, '.npm-global'), npm_config_cache: process.env.npm_config_cache ?? path.join(os.homedir(), '.npm'), npm_config_update_notifier: 'false', CI: '1'};
  for (const k of PASS_THROUGH) if (process.env[k]) env[k] = process.env[k];
  steps.push({id: 'clean-environment', pass: true, detail: {variables: Object.keys(env).sort(), globalPrefix: 'fresh (empty)', note: 'the npm download cache is reused only as a cache: npm ci verifies every package against the lockfile integrity hashes'}});

  // 3. the documented commands, nothing else
  for (const cmd of DRILL_COMMANDS) {
    const t = Date.now();
    const r = spawnSync(cmd[0], cmd.slice(1), {cwd: work, env, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 1 << 28});
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ').replaceAll(tmp, '<drill>').replaceAll(os.homedir(), '~');
    steps.push({id: cmd.join(' '), pass: r.status === 0, detail: {exitCode: r.status, seconds: Math.round((Date.now() - t) / 100) / 10, ...(r.status === 0 ? {} : {output: tail})}});
    if (r.status !== 0) throw Object.assign(new Error(`"${cmd.join(' ')}" failed in the clean environment`), {code: 'DEPLOY_DRILL_COMMAND_FAILED'});
  }

  // 4. generated files reproduce exactly; the artefact names no path of this machine
  const generatedAfter = computeTreeHash(path.join(work, 'public')).sha256;
  steps.push({id: 'generated-files-reproducible', pass: generatedAfter === generatedBefore, detail: {committed: generatedBefore, rebuilt: generatedAfter}});
  if (generatedAfter !== generatedBefore) throw Object.assign(new Error('the clean build changed committed generated files (public/)'), {code: 'DEPLOY_NOT_REPRODUCIBLE'});
  const artifact = path.join(work, 'dist-deploy');
  // text files only (a binary image can contain any short byte sequence by chance); the drill's own directories plus
  // the real home directory of the machine when it is specific enough to be meaningful
  const needles = [tmp, work, home, os.homedir()].filter((n) => n && n.length >= 8);
  const leaks = computeTreeHash(artifact).files.filter((f) => /\.(html|js|css|json|ya?ml|svg|txt)$/i.test(f)).filter((f) => { const s = fs.readFileSync(path.join(artifact, f), 'utf8'); return needles.some((n) => s.includes(n)); });
  steps.push({id: 'no-absolute-build-path', pass: leaks.length === 0, detail: {files: leaks.slice(0, 10)}});
  if (leaks.length) throw Object.assign(new Error('the artefact contains an absolute path of the build machine'), {code: 'DEPLOY_ABSOLUTE_PATH_LEAK'});
  const manifest = JSON.parse(fs.readFileSync(path.join(artifact, fs.readdirSync(artifact).find((f) => f.endsWith('.manifest.json'))), 'utf8'));
  steps.push({id: 'artifact', pass: true, detail: {mount: manifest.mount, fileCount: manifest.fileCount, sha256: manifest.sha256}});
  status = 'PASS';
} catch (e) { code = e.code ?? 'DEPLOY_DRILL_FAILED'; message = String(e.message).split('\n')[0]; }
finally { fs.rmSync(tmp, {recursive: true, force: true}); }

const report = {
  schema: 'kimyolab.deployment-clean-drill.v1',
  semantics: 'Clean-environment installation drill (scripts/deploy-drill.mjs): repository files only, fresh HOME and npm prefix, minimal PATH, exactly the documented commands. Approximates a clean server; it is not a real target server.',
  status, ...(code ? {code, message} : {}),
  platform: process.platform, node: process.version,
  commands: DRILL_COMMANDS.map((c) => c.join(' ')), steps, seconds: Math.round((Date.now() - started) / 1000),
};
fs.writeFileSync(path.join(root, 'reports', 'deployment-clean-drill.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const s of steps) console.log(`${s.pass ? '✓' : '✗'} ${s.id}`);
console.log(`deploy:drill ${status}${code ? ` — ${code}: ${message}` : ''}`);
if (status !== 'PASS') process.exitCode = 1;
