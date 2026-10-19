import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { pop, project, ramp, seeded } from '../anim';
import { cover } from '../assets';
import { IconCompass, IconFlask, IconMagnet, IconBulb } from '../components/Icons';
import { GlassChip, IconBadge, RevealTitle } from '../components/Typography';
import { goldText, theme } from '../theme';
import { Book } from '../three/Book';
import { glowTexture } from '../three/textures';
import { Dust, Pedestal, Stage3D } from '../three/Stage';

// 0:20–0:35 — grade 7 mathematics, physics and chemistry shown together, then each
// in focus with what it develops.

const TRIO = [
  { id: 'matematika-7', x: -3.15, from: [-6, 0, -4], label: 'Muammoli masalalar · Tanqidiy fikrlash', icon: <IconCompass size={26} /> },
  { id: 'fizika-7', x: 0, from: [0, -4, -3], label: 'Kuzatish va tajriba', icon: <IconMagnet size={26} /> },
  { id: 'kimyo-7', x: 3.15, from: [6, 0, -4], label: 'Modda va hodisalarni tushunish', icon: <IconFlask size={26} /> },
] as const;

const FORMULAS = ['a² + b² = c²', 'F = m·a', '2H₂ + O₂ → 2H₂O', 'v = s / t', 'S = a·b', 'ρ = m / V', '(a + b)² ', 'H₂O', 'x + 7 = 15', 'P = F / S', 'NaCl', 'E = mgh'];

const BOOK_H = 3.25;
const BASE_Y = -2.05;

const FOCUS = [
  [120, 200],
  [200, 280],
  [280, 360],
];

function Orbit({ frame, radius, tilt, speed, color, opacity }: { frame: number; radius: number; tilt: number; speed: number; color: string; opacity: number }) {
  const a = frame * speed;
  return (
    <group rotation={[tilt, 0, tilt * 0.6]}>
      <mesh>
        <torusGeometry args={[radius, 0.008, 8, 200]} />
        <meshBasicMaterial color={color} transparent opacity={0.45 * opacity} />
      </mesh>
      <mesh position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={opacity} />
      </mesh>
      <sprite position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]} scale={[0.6, 0.6, 1]}>
        <spriteMaterial map={glowTexture()} color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
    </group>
  );
}

export const Scene3Grade7: React.FC = () => {
  const frame = useCurrentFrame();
  const formulas = useMemo(() => {
    const r = seeded(77);
    return FORMULAS.map((f) => ({ f, x: 80 + r() * 1760, y: 300 + r() * 620, s: 20 + r() * 18, sp: 0.15 + r() * 0.25, d: r() * 120 }));
  }, []);

  const groupFocus = ramp(frame, 360, 410);
  const orbitOpacity = ramp(frame, 40, 100);

  return (
    <AbsoluteFill>
      {/* floating formulas */}
      {formulas.map((f, i) => {
        const o = ramp(frame, 20 + f.d, 60 + f.d) * 0.35;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: f.x,
              top: f.y - frame * f.sp,
              fontFamily: theme.body,
              fontStyle: 'italic',
              fontSize: f.s,
              color: '#a9c4ff',
              opacity: o,
              whiteSpace: 'nowrap',
              textShadow: '0 0 12px rgba(95,160,255,0.6)',
            }}
          >
            {f.f}
          </div>
        );
      })}

      <Stage3D>
        <group position={[0, 0, -1.5]}>
          <Orbit frame={frame} radius={5.6} tilt={1.25} speed={0.02} color="#5fd0ff" opacity={orbitOpacity} />
          <Orbit frame={frame + 90} radius={6.3} tilt={1.4} speed={-0.016} color="#e8b64c" opacity={orbitOpacity} />
        </group>
        <Pedestal frame={frame} y={BASE_Y} radius={5.2} z={-1.9} opacity={ramp(frame, 0, 30)} />
        {TRIO.map((b, i) => {
          const p = pop(frame, 18 + i * 20, 80, 15);
          const [f0, f1] = FOCUS[i];
          const focus = ramp(frame, f0, f0 + 25) * (1 - ramp(frame, f1 - 5, f1 + 20)) * (1 - groupFocus);
          const anyFocus = FOCUS.reduce((m, [a, z]) => Math.max(m, ramp(frame, a, a + 25) * (1 - ramp(frame, z - 5, z + 20))), 0) * (1 - groupFocus);
          const dim = anyFocus - focus;
          const turn = Math.sin((frame + i * 50) / 80) * 0.06;
          return (
            <Book
              key={b.id}
              cover={cover(b.id)}
              height={BOOK_H}
              position={[
                b.x + (1 - p) * b.from[0],
                BASE_Y + BOOK_H / 2 + (1 - p) * b.from[1] + focus * 0.18,
                (1 - p) * b.from[2] + focus * 1.1 - dim * 0.4,
              ]}
              rotation={[0, (i - 1) * -0.18 * (1 - focus) + turn + (1 - p) * (i - 1) * 1.2, 0]}
              opacity={Math.min(1, p * 1.4) * (1 - dim * 0.35)}
              highlight={focus}
              glow={focus + groupFocus * 0.6}
              sweep={ramp(frame, FOCUS[i][0] + 8, FOCUS[i][0] + 55, -0.45, 1.85)}
            />
          );
        })}
        <Dust frame={frame + 600} count={180} seed={23} color="#9cc6ff" />
      </Stage3D>

      {/* title block */}
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 34 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 112, lineHeight: 1, opacity: ramp(frame, 6, 30), transform: `scale(${1.25 - 0.25 * ramp(frame, 6, 40)})`, ...goldText }}>
          7-SINF
        </div>
        <RevealTitle text="Matematika · Fizika · Kimyo" frame={frame} start={30} size={46} tracking={0.08} />
        <div style={{ height: 6 }} />
        <RevealTitle
          text="Ilm · Tajriba · Mantiq · Hayot"
          frame={frame}
          start={55}
          size={22}
          gold={false}
          weight={600}
          font={theme.body}
          tracking={0.42}
          color={theme.muted}
        />
      </AbsoluteFill>

      {/* per-book captions */}
      {TRIO.map((b, i) => {
        const [f0, f1] = FOCUS[i];
        const t = ramp(frame, f0 + 10, f0 + 30) * (1 - ramp(frame, f1 - 5, f1 + 10)) * (1 - groupFocus);
        const pos = project(b.x, BASE_Y - 0.55, 1);
        return (
          <GlassChip
            key={b.id}
            frame={frame}
            start={f0 + 10}
            from="up"
            icon={<IconBadge size={44}>{b.icon}</IconBadge>}
            style={{ position: 'absolute', left: pos.x, top: pos.y, transform: `translate(-50%, ${(1 - t) * 30}px)`, opacity: t, padding: '12px 22px', whiteSpace: 'nowrap' }}
          >
            <span style={{ fontFamily: theme.display, fontSize: 28, letterSpacing: '0.04em', color: theme.goldLight }}>{b.label.toUpperCase()}</span>
          </GlassChip>
        );
      })}

      {/* closing line for the trio */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 52, display: 'flex', justifyContent: 'center' }}>
        <GlassChip frame={frame} start={378} from="up" icon={<IconBadge size={44}><IconBulb size={26} /></IconBadge>} style={{ padding: '12px 26px' }}>
          <span style={{ fontFamily: theme.display, fontSize: 30, letterSpacing: '0.04em', color: theme.goldLight }}>
            HAYOTIY VAZIYATLAR BILAN BOG‘LIQ MISOLLAR
          </span>
        </GlassChip>
      </div>
    </AbsoluteFill>
  );
};
