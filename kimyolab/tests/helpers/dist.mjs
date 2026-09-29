// Hermetic build helpers for integration/E2E suites: the server is always tested
// against a freshly built deployment surface, never against the repository root.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let cached;

function run(args) {
  const r = spawnSync(process.execPath, args, {cwd: repoRoot, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
}

/** Builds app-preview + a production dist into a temp directory (once per process). */
export function buildDist() {
  if (cached && fs.existsSync(path.join(cached, 'index.html'))) return cached;
  run(['scripts/build-browser-preview.ts']);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kimyolab-dist-'));
  run(['scripts/build-production.ts', out]);
  cached = out;
  return out;
}

/** Copies a built dist so a test can tamper with it without affecting others. */
export function cloneDist(source = buildDist()) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kimyolab-dist-copy-'));
  fs.cpSync(source, out, {recursive: true});
  return out;
}

export async function startServer({publicRoot = buildDist(), env = {}, ...options} = {}) {
  const {createKimyoLabServer} = await import('../../server/app.mjs');
  const logs = [];
  const server = createKimyoLabServer({publicRoot, env, logger: (entry) => logs.push(entry), ...options});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  return {url: `http://127.0.0.1:${port}`, port, logs, close: () => new Promise((resolve) => server.close(resolve))};
}

/** Spawns the real `node server.mjs` entry point (used to test the production entry). */
export async function spawnServer({publicRoot = buildDist(), env = {}} = {}) {
  const child = spawn(process.execPath, ['server.mjs'], {cwd: repoRoot, env: {...process.env, ...env, KIMYOLAB_PUBLIC_ROOT: publicRoot, PORT: '0', HOST: '127.0.0.1'}, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', (c) => { output += c; });
  child.stderr.on('data', (c) => { output += c; });
  const deadline = Date.now() + 8000;
  while (!/http:\/\/127\.0\.0\.1:(\d+)/.test(output)) {
    if (child.exitCode !== null) return {child, output, exited: true};
    if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`server did not start: ${output}`); }
    await new Promise((r) => setTimeout(r, 25));
  }
  const port = Number(output.match(/http:\/\/127\.0\.0\.1:(\d+)/)[1]);
  return {child, output, url: `http://127.0.0.1:${port}`, stop: () => new Promise((resolve) => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill('SIGTERM'); })};
}

/** Raw HTTP request that does not normalise the path (needed for traversal tests). */
export async function rawRequest(url, requestPath, {method = 'GET', headers = {}, body} = {}) {
  const http = await import('node:http');
  const {hostname, port} = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({host: hostname, port, method, path: requestPath, headers}, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: data}));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/**
 * Lets a test change pack files in a CLONED dist and re-seal the pack exactly like build-content-pack does
 * (file checksums/sizes, aggregate checksum, activation pointer). Used to exercise states the committed
 * content does not have yet (e.g. approved assessment items) without weakening integrity checks.
 */
export async function resealContentPack(distRoot, mutate) {
  const {createHash} = await import('node:crypto');
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const pointerFile = path.join(distRoot, 'content', 'manifest.json');
  const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
  const packDir = path.join(distRoot, 'content', pointer.activeVersion);
  await mutate(packDir);
  const manifestFile = path.join(packDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.files = manifest.files.map((f) => { const bytes = fs.readFileSync(path.join(packDir, f.path)); return {path: f.path, checksum: sha(bytes), size: bytes.length}; });
  manifest.checksum = sha(Buffer.from(manifest.files.map((x) => `${x.path}:${x.checksum}:${x.size}`).join('\n'), 'utf8'));
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  pointer.checksum = manifest.checksum;
  fs.writeFileSync(pointerFile, `${JSON.stringify(pointer, null, 2)}\n`);
  return distRoot;
}
