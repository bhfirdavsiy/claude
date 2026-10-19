import { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { seeded } from '../anim';
import { SCENES } from '../timeline';

// Persistent night-sky backdrop shared by all scenes. Everything here is procedural
// vector art (no imagery), so the only pictures in the film are the original assets.

const skylineByScene = [1, 0.3, 0.22, 0.12, 0.35, 1];

function dome(x: number, base: number, w: number, drum: number) {
  const t = base - drum;
  return `M ${x - w} ${base} V ${t} C ${x - w * 1.28} ${t - w * 0.85}, ${x - w * 0.42} ${t - w * 1.2}, ${x} ${t - w * 1.65} C ${x + w * 0.42} ${t - w * 1.2}, ${x + w * 1.28} ${t - w * 0.85}, ${x + w} ${t} V ${base} Z`;
}

function minaret(x: number, base: number, h: number, w: number) {
  const top = base - h;
  const wt = w * 0.72;
  return `M ${x - w} ${base} L ${x - wt} ${top + 22} L ${x - wt - 6} ${top + 22} L ${x - wt - 6} ${top + 12} L ${x - wt + 2} ${top} L ${x + wt - 2} ${top} L ${x + wt + 6} ${top + 12} L ${x + wt + 6} ${top + 22} L ${x + wt} ${top + 22} L ${x + w} ${base} Z M ${x - wt + 2} ${top} C ${x - wt} ${top - 16}, ${x} ${top - 24}, ${x} ${top - 30} C ${x} ${top - 24}, ${x + wt} ${top - 16}, ${x + wt - 2} ${top} Z`;
}

function portal(x: number, base: number, w: number, h: number) {
  return `M ${x - w} ${base} V ${base - h} H ${x + w} V ${base} Z`;
}

function arch(x: number, base: number, w: number, h: number) {
  const top = base - h;
  return `M ${x - w} ${base} V ${top + w * 0.9} Q ${x - w} ${top + w * 0.15} ${x} ${top} Q ${x + w} ${top + w * 0.15} ${x + w} ${top + w * 0.9} V ${base}`;
}

/** A Registan-inspired ensemble: portals, ribbed domes, minarets. */
function Ensemble({ cx, base, s, fill, rim }: { cx: number; base: number; s: number; fill: string; rim: string }) {
  const parts: string[] = [];
  const arches: string[] = [];
  // central portal flanked by minarets, domes behind
  parts.push(dome(cx - 120 * s, base - 80 * s, 52 * s, 40 * s));
  parts.push(dome(cx + 130 * s, base - 70 * s, 46 * s, 36 * s));
  parts.push(portal(cx, base, 95 * s, 210 * s));
  arches.push(arch(cx, base - 12 * s, 55 * s, 170 * s));
  parts.push(minaret(cx - 125 * s, base, 300 * s, 16 * s));
  parts.push(minaret(cx + 125 * s, base, 300 * s, 16 * s));
  parts.push(portal(cx - 210 * s, base, 85 * s, 110 * s));
  parts.push(portal(cx + 210 * s, base, 85 * s, 110 * s));
  for (let i = -3; i <= 3; i++) if (i !== 0) arches.push(arch(cx + i * 58 * s + (i > 0 ? 30 : -30) * s, base - 10 * s, 16 * s, 70 * s));
  return (
    <g>
      <path d={parts.join(' ')} fill={fill} stroke={rim} strokeWidth={1.4} />
      <path d={arches.join(' ')} fill="none" stroke={rim} strokeWidth={1.2} opacity={0.9} />
    </g>
  );
}

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const stars = useMemo(() => {
    const r = seeded(42);
    return Array.from({ length: 170 }, () => ({ x: r() * 1920, y: r() * 640, s: 0.6 + r() * 1.8, p: r() * 6.28, sp: 0.03 + r() * 0.06 }));
  }, []);

  const skyline = interpolate(
    frame,
    SCENES.flatMap((s, i) => [s.start + (i ? 8 : 0), s.start + s.duration - 8]),
    SCENES.flatMap((_, i) => [skylineByScene[i], skylineByScene[i]]),
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const drift = frame * 0.12;

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 38%, #10306f 0%, #081840 38%, #040b22 72%, #020611 100%)' }}>
      {/* drifting nebula glows */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 35% at ${30 + Math.sin(frame / 160) * 6}% ${28 + Math.cos(frame / 190) * 4}%, rgba(61,123,255,0.28), transparent 70%),
            radial-gradient(35% 30% at ${72 + Math.cos(frame / 170) * 5}% ${34 + Math.sin(frame / 150) * 4}%, rgba(232,182,76,0.14), transparent 70%)`,
        }}
      />
      {/* god rays */}
      <AbsoluteFill
        style={{
          background: `repeating-conic-gradient(from ${frame * 0.05}deg at 50% -10%, rgba(140,180,255,0.032) 0deg 3deg, transparent 3deg 9deg)`,
          maskImage: 'linear-gradient(180deg, black 0%, transparent 75%)',
          WebkitMaskImage: 'linear-gradient(180deg, black 0%, transparent 75%)',
        }}
      />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {stars.map((st, i) => (
          <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="#dfe8ff" opacity={0.25 + 0.55 * (0.5 + 0.5 * Math.sin(frame * st.sp + st.p))} />
        ))}
      </svg>
      {/* Samarkand-inspired skyline, two parallax layers */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: skyline }}>
        <defs>
          <linearGradient id="horizon" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(255,196,110,0)" />
            <stop offset="0.7" stopColor="rgba(255,196,110,0.22)" />
            <stop offset="1" stopColor="rgba(61,123,255,0.1)" />
          </linearGradient>
        </defs>
        <rect x={0} y={700} width={1920} height={260} fill="url(#horizon)" />
        <g transform={`translate(${-drift * 0.4}, 0)`} opacity={0.55}>
          <Ensemble cx={260} base={905} s={0.8} fill="#0b1b45" rim="rgba(255,205,120,0.35)" />
          <Ensemble cx={1700} base={905} s={0.85} fill="#0b1b45" rim="rgba(255,205,120,0.35)" />
          <Ensemble cx={980} base={905} s={0.65} fill="#0b1b45" rim="rgba(255,205,120,0.25)" />
        </g>
        <g transform={`translate(${-drift}, 0)`}>
          <Ensemble cx={-40} base={980} s={1.05} fill="#060f2c" rim="rgba(255,205,120,0.55)" />
          <Ensemble cx={1990} base={980} s={1.1} fill="#060f2c" rim="rgba(255,205,120,0.55)" />
        </g>
        <rect x={0} y={975} width={1920} height={105} fill="#040a1f" />
      </svg>
    </AbsoluteFill>
  );
};

/** Vignette + animated film grain + subtle letterbox shading. */
export const FilmFinish: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(110% 85% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)' }} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'overlay' }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 24} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
