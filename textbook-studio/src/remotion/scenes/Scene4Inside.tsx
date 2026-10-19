import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { lerp, ramp } from '../anim';
import { assetUrl, example } from '../assets';
import { Ornament, RevealTitle } from '../components/Typography';
import { theme } from '../theme';

// 0:35–0:45 — authentic inside pages (unmodified photos supplied by the user), with a
// magnifier that zooms into the key illustration of each page.

const PAGES = [
  { id: 'matematika-7-p93', theme1: 'Mantiqiy', theme2: 'fikrlash' },
  { id: 'fizika-7-p19', theme1: 'Tajriba', theme2: 'va kuzatish' },
  { id: 'kimyo-7-p22', theme1: 'Tahlil', theme2: 'va xulosa' },
] as const;

const PAGE_W = 440;
const GAP = 120;
const FOCUS_START = 70;
const FOCUS_LEN = 60;
const LENS = 250;
const ZOOM = 2.3;

export const Scene4Inside: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = ramp(frame, 250, 290);

  return (
    <AbsoluteFill style={{ perspective: 2200 }}>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 44 }}>
        <RevealTitle text="Darslik ichidan" frame={frame} start={4} size={64} />
        <div style={{ height: 6 }} />
        <RevealTitle
          text="Real sahifalar · Real misollar"
          frame={frame}
          start={20}
          size={22}
          gold={false}
          weight={600}
          font={theme.body}
          tracking={0.36}
          color={theme.muted}
        />
        <div style={{ height: 8 }} />
        <Ornament frame={frame} start={26} width={360} />
      </AbsoluteFill>

      {PAGES.map((pg, i) => {
        const ex = example(pg.id);
        const h = (PAGE_W * ex.height) / ex.width;
        const enter = ramp(frame, 6 + i * 12, 50 + i * 12);
        const fs = FOCUS_START + i * FOCUS_LEN;
        const focus = ramp(frame, fs, fs + 18) * (1 - ramp(frame, fs + FOCUS_LEN - 8, fs + FOCUS_LEN + 10)) * (1 - settle);
        const anyFocus = PAGES.reduce((m, _, j) => {
          const s = FOCUS_START + j * FOCUS_LEN;
          return Math.max(m, ramp(frame, s, s + 18) * (1 - ramp(frame, s + FOCUS_LEN - 8, s + FOCUS_LEN + 10)));
        }, 0) * (1 - settle);
        const dim = anyFocus - focus;
        const cx = 960 + (i - 1) * (PAGE_W + GAP);
        const top = 225 + (610 - h) / 2;
        const baseRy = (i - 1) * -16;
        const ry = lerp(baseRy + (i - 1) * -50, baseRy, enter) * (1 - focus);
        const scale = (0.85 + 0.15 * enter) * (1 + focus * 0.06 + settle * 0.03);
        const lensT = ramp(frame, fs + 10, fs + 26) * (1 - ramp(frame, fs + FOCUS_LEN - 6, fs + FOCUS_LEN + 6));
        const [fx, fy] = ex.focus;
        const url = assetUrl(ex.file);

        return (
          <div key={pg.id}>
            <div
              style={{
                position: 'absolute',
                left: cx - PAGE_W / 2,
                top,
                width: PAGE_W,
                height: h,
                transformStyle: 'preserve-3d',
                transform: `translateY(${(1 - enter) * 160}px) translateZ(${focus * 120 - dim * 60}px) rotateY(${ry}deg) scale(${scale})`,
                opacity: enter * (1 - dim * 0.45),
                filter: `brightness(${1 - dim * 0.35})`,
                boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(232,182,76,${0.25 + focus * 0.6}), 0 0 ${60 * focus}px rgba(232,182,76,${0.5 * focus})`,
                borderRadius: 6,
                background: '#fff',
              }}
            >
              <Img src={url} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 6 }} />
              {/* page curl shading */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'linear-gradient(90deg, rgba(0,0,0,0.12), transparent 8%, transparent 92%, rgba(0,0,0,0.08))' }} />
              {/* magnifier showing the same original image, enlarged */}
              <div
                style={{
                  position: 'absolute',
                  left: fx * PAGE_W - LENS / 2,
                  top: fy * h - LENS / 2,
                  width: LENS,
                  height: LENS,
                  borderRadius: '50%',
                  opacity: lensT,
                  transform: `scale(${0.6 + 0.4 * lensT})`,
                  backgroundImage: `url(${url})`,
                  backgroundSize: `${PAGE_W * ZOOM}px ${h * ZOOM}px`,
                  backgroundPosition: `${-(fx * PAGE_W * ZOOM - LENS / 2)}px ${-(fy * h * ZOOM - LENS / 2)}px`,
                  border: `4px solid ${theme.goldLight}`,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.55), 0 0 30px rgba(232,182,76,0.6), inset 0 0 25px rgba(0,0,0,0.25)',
                }}
              />
            </div>
            <div
              style={{
                position: 'absolute',
                left: cx,
                top: 905,
                transform: `translate(-50%, ${(1 - enter) * 30}px) scale(${1 + focus * 0.08})`,
                opacity: enter,
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontFamily: theme.display, fontSize: 46, lineHeight: 1, letterSpacing: '0.04em', color: focus > 0.5 ? theme.goldLight : theme.text }}>
                {pg.theme1.toUpperCase()}
              </div>
              <div style={{ fontFamily: theme.display, fontSize: 26, letterSpacing: '0.12em', color: theme.goldLight, marginTop: 4 }}>{pg.theme2.toUpperCase()}</div>
              <div style={{ fontFamily: theme.body, fontSize: 16, color: theme.muted, marginTop: 8, letterSpacing: '0.04em' }}>{ex.source}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
