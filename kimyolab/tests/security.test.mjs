import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const parent = path.dirname(root);
const siblingSecret = path.join(parent, `${path.basename(root)}-secret.txt`);

async function startServer() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  const onData = chunk => { output += chunk.toString(); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  const deadline = Date.now() + 5000;
  while (!output.includes('http://127.0.0.1:4173')) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}): ${output}`);
    }
    if (Date.now() > deadline) {
      child.kill('SIGTERM');
      throw new Error(`server did not start in time: ${output}`);
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return child;
}


function rawRequest(requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 4173,
      method: 'GET',
      path: requestPath
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({status: response.statusCode, body, headers: response.headers}));
    });
    req.on('error', reject);
    req.end();
  });
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 1000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('static server rejects traversal to a sibling path sharing the root prefix', async () => {
  fs.writeFileSync(siblingSecret, 'TOP-SECRET-OUTSIDE-WEB-ROOT', 'utf8');
  let child;
  try {
    child = await startServer();
    const {status, body} = await rawRequest('/%2e%2e/phase-0-secret.txt');

    assert.equal(status, 403);
    assert.doesNotMatch(body, /TOP-SECRET-OUTSIDE-WEB-ROOT/);
  } finally {
    if (child) await stopServer(child);
    fs.rmSync(siblingSecret, {force: true});
  }
});

test('static server does not expose internal source files', async () => {
  let child;
  try {
    child = await startServer();
    const {status, body} = await rawRequest('/source/KimyoLab_v20_nazariya_amaliyot_mapping.xlsx');

    assert.equal(status, 404);
    assert.doesNotMatch(body, /PK\u0003\u0004/);
  } finally {
    if (child) await stopServer(child);
  }
});


test('malformed URL encoding returns 400 without crashing the server', async () => {
  let child;
  try {
    child = await startServer();
    const malformed = await rawRequest('/%E0%A4%A');
    assert.equal(malformed.status, 400);

    const healthy = await rawRequest('/index.html');
    assert.equal(healthy.status, 200);
  } finally {
    if (child) await stopServer(child);
  }
});


test('static server sends baseline browser security headers', async () => {
  let child;
  try {
    child = await startServer();
    const {status, headers} = await rawRequest('/app.html');
    assert.equal(status, 200);
    assert.match(String(headers['content-security-policy']),/default-src 'self'/);
    assert.equal(headers['x-content-type-options'],'nosniff');
    assert.equal(headers['referrer-policy'],'no-referrer');
    assert.equal(headers['x-frame-options'],'DENY');
  } finally {
    if (child) await stopServer(child);
  }
});
