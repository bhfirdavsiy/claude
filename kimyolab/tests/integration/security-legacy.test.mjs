// Baseline security regressions carried over from Phase 12 (now run against the built dist).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildDist, spawnServer, rawRequest} from '../helpers/dist.mjs';

test('static server rejects traversal to a sibling path sharing the root prefix', async () => {
  const dist = buildDist();
  const sibling = `${dist}-secret.txt`;
  fs.writeFileSync(sibling, 'TOP-SECRET-OUTSIDE-WEB-ROOT', 'utf8');
  const server = await spawnServer({publicRoot: dist});
  try {
    const {status, body} = await rawRequest(server.url, `/%2e%2e/${path.basename(sibling)}`);
    assert.equal(status, 404);
    assert.doesNotMatch(body, /TOP-SECRET-OUTSIDE-WEB-ROOT/);
  } finally {
    await server.stop();
    fs.rmSync(sibling, {force: true});
  }
});

test('static server does not expose internal source files', async () => {
  const server = await spawnServer();
  try {
    const {status, body} = await rawRequest(server.url, '/source/KimyoLab_v20_nazariya_amaliyot_mapping.xlsx');
    assert.equal(status, 404);
    assert.doesNotMatch(body, /PK\u0003\u0004/);
  } finally { await server.stop(); }
});

test('malformed URL encoding returns 400 without crashing the server', async () => {
  const server = await spawnServer();
  try {
    assert.equal((await rawRequest(server.url, '/%E0%A4%A')).status, 400);
    assert.equal((await rawRequest(server.url, '/index.html')).status, 200);
  } finally { await server.stop(); }
});

test('static server sends baseline browser security headers', async () => {
  const server = await spawnServer();
  try {
    const {status, headers} = await rawRequest(server.url, '/app.html');
    assert.equal(status, 200);
    assert.match(String(headers['content-security-policy']), /default-src 'self'/);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'no-referrer');
    assert.equal(headers['x-frame-options'], 'DENY');
  } finally { await server.stop(); }
});

test('server refuses to start without a built public root', async () => {
  const empty = fs.mkdtempSync(path.join(buildDist(), '..', 'kimyolab-empty-'));
  const server = await spawnServer({publicRoot: empty});
  assert.equal(server.exited, true);
  assert.match(server.output, /PUBLIC_ROOT_NOT_BUILT/);
});
