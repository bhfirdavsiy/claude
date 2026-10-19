import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { pop, ramp, rampInOut } from '../anim';
import { cover } from '../assets';
import { Ornament, RevealTitle } from '../components/Typography';
import { theme } from '../theme';
import { Book } from '../three/Book';
import { Dust, Pedestal, Stage3D } from '../three/Stage';

// 0:00–0:08 — all nine real covers rise onto a gold-rimmed pedestal under a
// Samarkand night sky; title "Yangi avlod darsliklari".

export const LINEUP = [
  'alifbe-1',
  'matematika-2',
  'matematika-3',
  'fizika-7',
  'matematika-7',
  'kimyo-7',
  'informatika-mashq-3',
  'informatika-mashq-2',
  'informatika-1',
];

/** Arc layout used by the intro and the finale. */
export function arcSlot(i: number, n = LINEUP.length, step = 0.2, radius = 10) {
  const a = (i - (n - 1) / 2) * step;
  return { x: Math.sin(a) * radius, z: Math.cos(a) * radius - radius, ry: -a * 0.85, center: Math.abs(i - (n - 1) / 2) };
}

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const dolly = rampInOut(frame, 0, 240, -3.2, 0);
  const sway = Math.sin(frame / 70) * 0.04;
  const fade = ramp(frame, 0, 24);

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Stage3D>
        <group position={[0, 0.75, dolly]} rotation={[0.13, sway, 0]}>
          <Pedestal frame={frame} y={-1.25} radius={5.4} z={-2.4} opacity={ramp(frame, 0, 30)} />
          {LINEUP.map((id, i) => {
            const s = arcSlot(i);
            const p = pop(frame, 14 + s.center * 9, 90, 15);
            const big = id.endsWith('-7');
            const h = big ? 2.4 : 2.1;
            const sweepStart = 120 + i * 6;
            return (
              <Book
                key={id}
                cover={cover(id)}
                height={h}
                position={[s.x, -1.25 + h / 2 + (1 - p) * 0.6, s.z - (1 - p) * 6]}
                rotation={[0, s.ry + (1 - p) * 0.9, 0]}
                opacity={Math.min(1, p * 1.4)}
                sweep={ramp(frame, sweepStart, sweepStart + 45, -0.45, 1.85)}
                glow={i === 4 ? ramp(frame, 60, 120) : 0}
              />
            );
          })}
          <Dust frame={frame} opacity={ramp(frame, 10, 60)} />
        </group>
      </Stage3D>

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 92 }}>
        <RevealTitle text="Yangi avlod darsliklari" frame={frame} start={100} size={104} />
        <div style={{ height: 14 }} />
        <RevealTitle
          text="Zamonaviy ta’lim poydevori"
          frame={frame}
          start={128}
          size={38}
          gold={false}
          weight={500}
          font={theme.body}
          tracking={0.22}
          stagger={3}
        />
        <div style={{ height: 18 }} />
        <Ornament frame={frame} start={140} width={520} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
