import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUT = resolve(__dirname, 'out/textbook-studio-60s.mp4');

type RenderJob = {
  status: 'idle' | 'bundling' | 'rendering' | 'encoding' | 'done' | 'error';
  progress: number;
  renderedFrames: number;
  totalFrames: number;
  message?: string;
  startedAt?: number;
  finishedAt?: number;
};

// Local MP4 export API (dev + `vite preview` only). Spawns scripts/render.mjs, which
// renders the Remotion composition frame-by-frame in headless Chromium and encodes H.264.
function renderApi(): Plugin {
  let job: RenderJob = { status: 'idle', progress: 0, renderedFrames: 0, totalFrames: 1800 };
  let child: ChildProcess | null = null;

  const attach = (server: { middlewares: { use: (path: string, fn: (req: any, res: any) => void) => void } }) => {
    server.middlewares.use('/api/render', (req, res) => {
      const url = req.url ?? '/';
      const json = (code: number, body: unknown) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(body));
      };

      if (req.method === 'GET' && (url === '/' || url.startsWith('/status'))) {
        const file = existsSync(OUTPUT) ? { bytes: statSync(OUTPUT).size, mtime: statSync(OUTPUT).mtimeMs } : null;
        return json(200, { ...job, file });
      }

      if (req.method === 'POST' && url.startsWith('/start')) {
        if (child) return json(409, { error: 'Render already running' });
        job = { status: 'bundling', progress: 0, renderedFrames: 0, totalFrames: 1800, startedAt: Date.now() };
        child = spawn(process.execPath, [resolve(__dirname, 'scripts/render.mjs'), '--json'], {
          cwd: __dirname,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let buffer = '';
        child.stdout?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            try {
              const evt = JSON.parse(line);
              if (evt.type === 'progress') job = { ...job, ...evt.job };
              if (evt.type === 'done') job = { ...job, status: 'done', progress: 1, finishedAt: Date.now() };
              if (evt.type === 'error') job = { ...job, status: 'error', message: evt.message };
            } catch {
              /* non-JSON log line */
            }
          }
        });
        child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
        child.on('exit', (code) => {
          if (code !== 0 && job.status !== 'error') job = { ...job, status: 'error', message: `Renderer exited with code ${code}` };
          child = null;
        });
        return json(202, job);
      }

      if (req.method === 'GET' && url.startsWith('/file')) {
        if (!existsSync(OUTPUT)) return json(404, { error: 'No MP4 rendered yet' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', statSync(OUTPUT).size);
        res.setHeader('Content-Disposition', 'attachment; filename="textbook-studio-60s.mp4"');
        return createReadStream(OUTPUT).pipe(res);
      }

      json(404, { error: 'Unknown endpoint' });
    });
  };

  return {
    name: 'textbook-studio-render-api',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig({
  plugins: [react(), renderApi()],
  // Original, unmodified assets are served straight from the repository-root public/ folder
  // (textbooks/ and examples/). Vite copies them into dist/ for Vercel.
  publicDir: resolve(__dirname, '../public'),
  build: { chunkSizeWarningLimit: 2000 },
  server: { fs: { allow: [resolve(__dirname, '..')] } },
});
