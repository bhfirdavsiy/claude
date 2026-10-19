# Textbook Studio

A 60-second cinematic, silent, 16:9 (1920×1080, 30 fps) promo film for the new textbooks. It runs
as a website with a preview player and a real MP4 export.

Stack: React 19 · TypeScript · Three.js / React Three Fiber (via `@remotion/three`) · Remotion 4 · Vite 6.

This app lives entirely in `textbook-studio/`. It doesn't modify any other project in the repository.

## Assets (verified, used read-only)

The film uses only the original files in the repository-root `public/` folder. `src/assets.manifest.json`
records each file's size, pixel dimensions and SHA-256 hash.
`npm run verify-assets` runs automatically before `dev` and `build`. It fails the build if any file is missing or changed.

| File | Content |
| --- | --- |
| `public/textbooks/01_Alifbe_1sinf.png` | Alifbe, grade 1 |
| `public/textbooks/02_Informatika_1sinf.png` | Informatika va axborot texnologiyalari, grade 1 |
| `public/textbooks/03_Matematika_2sinf.png` | Matematika, I qism, grade 2 |
| `public/textbooks/04_Informatika_mashq_2sinf.png` | Informatika, mashq daftari, grade 2 |
| `public/textbooks/05_Matematika_3sinf.png` | Matematika, I qism, grade 3 |
| `public/textbooks/06_Informatika_mashq_3sinf.png` | Informatika, mashq daftari, grade 3 |
| `public/textbooks/07_Matematika_7sinf.png` | Matematika (Tadqiqot va kashfiyot), grade 7 |
| `public/textbooks/08_Fizika_7sinf.png` | Fizika, grade 7 |
| `public/textbooks/09_Kimyo_7sinf.png` | Kimyo, grade 7 |
| `public/examples/photo_2026-10-19_17-15-00.jpg` | Matematika 7, p. 93 (algebraic expressions) |
| `public/examples/photo_2026-10-19_17-14-59.jpg` | Fizika 7, p. 19 (chapter-1 review questions, magnets) |
| `public/examples/image_2026-10-19_16-53-30.png` | Kimyo 7, p. 22 (changes of state) |

The cover PNGs are 1080×1920 with white padding. The printed cover is cut out at render time with
texture UVs and CSS, using the `crop` rectangles in the manifest. The files on disk are never rewritten.
`references/approved_storyboard.png` sets the timing and the navy/gold look only. Its invented book art is never shown.
Per `README_ASSETS.txt`, the primary-school scene covers grades 1–3 (no grade 4).

### How asset paths work

- **Vite (dev, preview, build):** `publicDir` is `../public`, so `/textbooks/…` and `/examples/…` are served
  from the originals. `vite build` copies them byte-for-byte into `dist/`.
- **Remotion (Studio and MP4 render):** `remotion.config.ts` and the render scripts set `publicDir` to `../public`.
  The film code resolves every path with `staticFile()`, so the same code works in both environments.

## Scenes

| # | Time | Content |
| --- | --- | --- |
| 1 | 0:00–0:08 | All 9 real covers rise onto a gold pedestal under a Samarkand-inspired night sky. Title: "Yangi avlod darsliklari". |
| 2 | 0:08–0:20 | Grades 1–3: two real books per grade, then four value cards. |
| 3 | 0:20–0:35 | Grade 7 maths, physics and chemistry together, then each one in focus with a caption. |
| 4 | 0:35–0:45 | Three real inside pages, each with a magnifier lens: Mantiqiy fikrlash, Tajriba va kuzatish, Tahlil va xulosa. |
| 5 | 0:45–0:53 | Data globe with arcs Tashkent → Helsinki and Tashkent → Singapore, the Finland and Singapore 5E cards, and the 5E sequence. |
| 6 | 0:53–1:00 | Full collection under an arc of values. Closing statement. |

Every animation is a pure function of `useCurrentFrame()`: no timers, no `Math.random()` (a seeded PRNG is
used instead). The cover textures and fonts block rendering via `delayRender()` until they have loaded.
So any frame renders the same in the browser preview and in the MP4.

## Run locally

```bash
cd textbook-studio
npm install
npm run dev          # http://localhost:5173 — preview player + MP4 export button
```

Player controls:

- Play/Pause: the button, a click on the video, or `Space`.
- Seek: the timeline, the chapter buttons, or `←`/`→` (±1 s).
- Fullscreen: the button or `F`.

## MP4 export

- **From the website** (`npm run dev` or `npm run preview`): click **MP4 eksport qilish**.
  The Vite server runs `scripts/render.mjs`, which renders all 1800 frames in headless Chromium,
  encodes H.264 (yuv420p, CRF 18, no audio track) and shows progress. When it finishes, a **Download** link appears.
- **From the CLI:** `npm run render` writes `out/textbook-studio-60s.mp4`.
  `FRAMES=0-299 npm run render` renders a range.
  `npm run render:still 150 900` writes PNG stills to `out/stills/`.
- **Remotion Studio:** `npm run studio`.

The render script uses a locally installed Chromium headless shell if it finds one.
Set `REMOTION_BROWSER_EXECUTABLE` to choose another; with neither, Remotion downloads its own.
WebGL uses `--gl=angle` (override with `REMOTION_GL`).

## Deploying to Vercel (not done automatically)

Create a Vercel project with **Root Directory = `textbook-studio`**. `vercel.json` sets the framework, the
install and build commands, and `dist` as the output. The build reads `../public`, so keep Vercel's default setting
"Include files outside of the Root Directory in the Build Step" switched on.

A static deployment hosts the preview player. MP4 rendering needs a server process (headless Chromium + ffmpeg),
so on Vercel the Export panel shows the CLI instructions instead.

## Licensing note

Remotion is free for individuals and companies with up to 3 employees. Larger organisations need a
[Remotion company license](https://www.remotion.dev/license).
