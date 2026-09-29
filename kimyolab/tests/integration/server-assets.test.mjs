import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../helpers/dist.mjs';

test('app-preview browser assets are served from the built dist with security headers', async () => {
  const server = await startServer();
  try {
    const js = await fetch(`${server.url}/app-preview/app/bootstrap.js`);
    assert.equal(js.status, 200); assert.match(js.headers.get('content-type') ?? '', /javascript/); assert.ok(js.headers.get('content-security-policy'));
    const css = await fetch(`${server.url}/app-preview/ui/tokens/kimyolab.css`);
    assert.equal(css.status, 200); assert.match(css.headers.get('content-type') ?? '', /css/);
  } finally { await server.close(); }
});
