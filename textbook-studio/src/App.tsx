import { Player, type PlayerRef } from '@remotion/player';
import { useCallback, useEffect, useRef, useState } from 'react';
import manifest from './assets.manifest.json';
import { Film } from './remotion/Film';
import { DURATION, FPS, HEIGHT, SCENES, WIDTH } from './remotion/timeline';

const fmt = (frame: number) => {
  const s = frame / FPS;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
};

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export function App() {
  const playerRef = useRef<PlayerRef>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener('frameupdate', onFrame);
    p.addEventListener('seeked', onFrame);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    p.addEventListener('ended', onPause);
    return () => {
      p.removeEventListener('frameupdate', onFrame);
      p.removeEventListener('seeked', onFrame);
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
      p.removeEventListener('ended', onPause);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) p.pause();
    else {
      if (p.getCurrentFrame() >= DURATION - 1) p.seekTo(0);
      p.play();
    }
  }, []);

  const seek = useCallback((f: number) => {
    const clamped = Math.max(0, Math.min(DURATION - 1, Math.round(f)));
    playerRef.current?.seekTo(clamped);
    setFrame(clamped);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stageRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'ArrowRight') seek(frame + FPS);
      else if (e.code === 'ArrowLeft') seek(frame - FPS);
      else if (e.code === 'KeyF') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frame, seek, toggle, toggleFullscreen]);

  const activeScene = SCENES.findIndex((s) => frame >= s.start && frame < s.start + s.duration);

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <div>
            <h1>Textbook Studio</h1>
            <p>60 soniyalik kinematografik darslik filmi · 16:9 · {WIDTH}×{HEIGHT} · {FPS} fps · ovozsiz</p>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="stage-col">
          <div ref={stageRef} className={`stage ${fullscreen ? 'is-fullscreen' : ''}`}>
            <div className="player-frame" onClick={toggle}>
              <Player
                ref={playerRef}
                component={Film}
                durationInFrames={DURATION}
                fps={FPS}
                compositionWidth={WIDTH}
                compositionHeight={HEIGHT}
                style={{ width: '100%', height: '100%' }}
                controls={false}
                clickToPlay={false}
                doubleClickToFullscreen={false}
                spaceKeyToPlayOrPause={false}
                acknowledgeRemotionLicense
              />
            </div>

            <div className="controls">
              <button className="btn icon" onClick={toggle} aria-label={playing ? 'Pauza' : 'Ijro etish'}>
                {playing ? (
                  <svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
                )}
              </button>
              <span className="time">
                {fmt(frame)} <span className="dim">/ {fmt(DURATION)}</span>
              </span>

              <div className="scrubber">
                <div className="segments">
                  {SCENES.map((s, i) => (
                    <button
                      key={s.id}
                      className={`segment ${i === activeScene ? 'active' : ''}`}
                      style={{ left: `${(s.start / DURATION) * 100}%`, width: `${(s.duration / DURATION) * 100}%` }}
                      onClick={() => seek(s.start)}
                      title={`${i + 1}. ${s.title} (${s.label})`}
                    >
                      <span>{i + 1}</span>
                    </button>
                  ))}
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(frame / (DURATION - 1)) * 100}%` }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={DURATION - 1}
                  step={1}
                  value={frame}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label="Vaqt shkalasi"
                />
              </div>

              <button className="btn icon" onClick={toggleFullscreen} aria-label="To‘liq ekran">
                {fullscreen ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
                )}
              </button>
            </div>
          </div>

          <ol className="chapters">
            {SCENES.map((s, i) => (
              <li key={s.id}>
                <button className={i === activeScene ? 'active' : ''} onClick={() => seek(s.start)}>
                  <span className="num">{i + 1}</span>
                  <span className="ttl">{s.title}</span>
                  <span className="tc">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <aside className="side">
          <ExportPanel />
          <AssetPanel />
        </aside>
      </main>
    </div>
  );
}

type Job = {
  status: 'idle' | 'bundling' | 'rendering' | 'encoding' | 'done' | 'error';
  progress: number;
  renderedFrames: number;
  totalFrames: number;
  message?: string;
  file?: { bytes: number; mtime: number } | null;
};

function ExportPanel() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('api/render/status');
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error('unavailable');
      setJob(await res.json());
      setAvailable(true);
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    poll();
  }, [poll]);

  const busy = job && ['bundling', 'rendering', 'encoding'].includes(job.status);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [busy, poll]);

  const start = async () => {
    await fetch('api/render/start', { method: 'POST' });
    poll();
  };

  return (
    <div className="panel">
      <h2>MP4 eksport</h2>
      <p className="muted">
        Haqiqiy kadrma-kadr render: Remotion har bir 1800 kadrni headless Chromium’da chizadi va H.264 (1920×1080, 30 fps, yuv420p) MP4 faylga kodlaydi.
      </p>
      {available === null && <p className="muted">Render serveri tekshirilmoqda…</p>}
      {available === false && (
        <div className="note">
          <strong>Statik hostingda (masalan, Vercel) render serveri yo‘q.</strong> MP4 faylni lokal kompyuterda yarating:
          <pre>cd textbook-studio{'\n'}npm install{'\n'}npm run render</pre>
          Natija: <code>textbook-studio/out/textbook-studio-60s.mp4</code>. Yoki <code>npm run dev</code> bilan ochib, shu tugmadan foydalaning.
        </div>
      )}
      {available && job && (
        <>
          <button className="btn primary" onClick={start} disabled={!!busy}>
            {busy ? 'Render qilinmoqda…' : 'MP4 eksport qilish'}
          </button>
          {(busy || job.status === 'done') && (
            <div className="progress">
              <div className="bar">
                <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
              </div>
              <span>
                {job.status} · {Math.round(job.progress * 100)}% · {job.renderedFrames ?? 0}/{job.totalFrames} kadr
              </span>
            </div>
          )}
          {job.status === 'error' && <p className="error">Xato: {job.message}</p>}
          {job.file && !busy && (
            <a className="btn ghost" href="api/render/file" download>
              MP4 yuklab olish ({(job.file.bytes / 1e6).toFixed(1)} MB)
            </a>
          )}
        </>
      )}
    </div>
  );
}

function AssetPanel() {
  return (
    <div className="panel">
      <h2>Tasdiqlangan asl materiallar</h2>
      <p className="muted">Fayllar o‘zgartirilmagan; SHA-256 har bir build oldidan tekshiriladi.</p>
      <div className="thumbs">
        {manifest.covers.map((c) => (
          <figure key={c.id} title={`${c.file}\n${c.sha256}`}>
            <div className="thumb cover" style={{ backgroundImage: `url(${asset(c.file)})` }} />
            <figcaption>
              {c.subject} · {c.grade}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="thumbs pages">
        {manifest.examples.map((e) => (
          <figure key={e.id} title={`${e.file}\n${e.sha256}`}>
            <div className="thumb page" style={{ backgroundImage: `url(${asset(e.file)})` }} />
            <figcaption>{e.source}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
