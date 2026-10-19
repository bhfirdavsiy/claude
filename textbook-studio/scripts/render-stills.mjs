// Renders verification stills: node scripts/render-stills.mjs 120 400 900 ...
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frames = process.argv.slice(2).map(Number);
if (!frames.length) frames.push(150, 450, 900, 1200, 1500, 1750);

function findBrowser() {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) return process.env.REMOTION_BROWSER_EXECUTABLE;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse()) {
    const candidate = resolve(base, dir, 'chrome-linux/headless_shell');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const browserExecutable = findBrowser();
const chromiumOptions = { gl: process.env.REMOTION_GL ?? 'angle' };
const serveUrl = await bundle({ entryPoint: resolve(root, 'src/remotion/index.ts'), publicDir: resolve(root, '../public') });
const composition = await selectComposition({ serveUrl, id: 'TextbookFilm', browserExecutable, chromiumOptions });
for (const frame of frames) {
  const output = resolve(root, `out/stills/frame-${String(frame).padStart(4, '0')}.png`);
  await renderStill({ composition, serveUrl, frame, output, browserExecutable, chromiumOptions, timeoutInMilliseconds: 120000 });
  console.log(output);
}
