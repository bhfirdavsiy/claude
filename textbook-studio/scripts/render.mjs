// Real MP4 export: bundles the Remotion composition, renders all 1800 frames in headless
// Chromium (WebGL via ANGLE/SwiftShader) and encodes H.264 (yuv420p, silent).
//   node scripts/render.mjs            -> human-readable progress
//   node scripts/render.mjs --json     -> JSON lines (used by the in-browser Export button)
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');
const output = resolve(root, process.env.OUTPUT ?? 'out/textbook-studio-60s.mp4');
const frameRange = process.env.FRAMES ? process.env.FRAMES.split('-').map(Number) : null;

const emit = (evt) => {
  if (asJson) process.stdout.write(JSON.stringify(evt) + '\n');
  else if (evt.type === 'progress') process.stdout.write(`\r${evt.job.status} ${(evt.job.progress * 100).toFixed(1)}%   `);
  else console.log(`\n${evt.type}: ${evt.message ?? evt.output ?? ''}`);
};

// Prefer a locally installed Chromium headless shell (e.g. Playwright's) so no download is
// needed; otherwise Remotion downloads its own. Override with REMOTION_BROWSER_EXECUTABLE.
function findBrowser() {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) return process.env.REMOTION_BROWSER_EXECUTABLE;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse()) {
    for (const sub of ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const candidate = resolve(base, dir, sub);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

try {
  const browserExecutable = findBrowser();
  const chromiumOptions = { gl: process.env.REMOTION_GL ?? 'angle' };
  emit({ type: 'progress', job: { status: 'bundling', progress: 0 } });

  const serveUrl = await bundle({
    entryPoint: resolve(root, 'src/remotion/index.ts'),
    publicDir: resolve(root, '../public'),
  });

  const composition = await selectComposition({ serveUrl, id: 'TextbookFilm', browserExecutable, chromiumOptions });
  mkdirSync(dirname(output), { recursive: true });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 18,
    pixelFormat: 'yuv420p',
    muted: true,
    // PNG frames (lossless RGB) so x264 encodes standard limited-range yuv420p;
    // JPEG frames would produce full-range yuvj420p.
    imageFormat: 'png',
    outputLocation: output,
    browserExecutable,
    chromiumOptions,
    frameRange: frameRange ? [frameRange[0], frameRange[1]] : null,
    concurrency: Number(process.env.CONCURRENCY ?? Math.max(1, Math.min(4, cpus().length))),
    timeoutInMilliseconds: 120000,
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
      emit({
        type: 'progress',
        job: {
          status: stitchStage === 'muxing' || encodedFrames >= composition.durationInFrames ? 'encoding' : 'rendering',
          progress,
          renderedFrames,
          totalFrames: composition.durationInFrames,
        },
      });
    },
  });

  emit({ type: 'done', output });
} catch (err) {
  emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
