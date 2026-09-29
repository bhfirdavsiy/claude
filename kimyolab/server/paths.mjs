// Platform-safe path resolution for the server (P0.15.2).
// `new URL(import.meta.url).pathname` is wrong on Windows ("/C:/Program%20Files/...": leading slash,
// percent-encoded spaces and non-ASCII). Always convert module URLs with fileURLToPath.
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Resolves the public root (built deployment surface).
 * @param {object} options
 * @param {string} [options.moduleUrl]  file: URL of server/app.mjs (defaults to this module's sibling)
 * @param {string} [options.cwd]        explicit application root (overrides moduleUrl)
 * @param {string} [options.publicRoot] explicit public root
 * @param {Record<string,string|undefined>} [options.env]
 * @param {'win32'|'posix'} [options.platform]
 */
export function resolvePublicRoot({moduleUrl = new URL('./app.mjs', import.meta.url).href, cwd, publicRoot, env = process.env, platform = process.platform === 'win32' ? 'win32' : 'posix'} = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const appRoot = cwd ?? p.resolve(p.dirname(fileURLToPath(moduleUrl, {windows: platform === 'win32'})), '..');
  const explicit = publicRoot ?? env.KIMYOLAB_PUBLIC_ROOT;
  return explicit ? p.resolve(appRoot, explicit) : p.join(appRoot, 'dist');
}
