import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { pop, ramp } from '../anim';
import { cover } from '../assets';
import { IconBulb, IconCap, IconChart, IconLeaf, IconPeople } from '../components/Icons';
import { IconBadge, Ornament, RevealTitle } from '../components/Typography';
import { theme } from '../theme';
import { Book } from '../three/Book';
import { Dust, Pedestal, Stage3D } from '../three/Stage';
import { arcSlot, LINEUP } from './Scene1Intro';

// 0:53–1:00 — the full collection returns under an arc of values; closing statement.

const ICONS = [<IconPeople size={34} />, <IconBulb size={34} />, <IconCap size={44} />, <IconChart size={34} />, <IconLeaf size={34} />];
const ARC = { cx: 960, cy: 400, rx: 520, ry: 290 };

export const Scene6Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const arcT = ramp(frame, 20, 75);

  return (
    <AbsoluteFill>
      {/* value arc sits behind the books */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="arcGold" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(232,182,76,0)" />
            <stop offset="0.5" stopColor="#ffe3a1" />
            <stop offset="1" stopColor="rgba(232,182,76,0)" />
          </linearGradient>
          <filter id="arcGlow">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {[0, 1].map((blur) => (
          <path
            key={blur}
            d={`M ${ARC.cx - ARC.rx} ${ARC.cy} A ${ARC.rx} ${ARC.ry} 0 0 1 ${ARC.cx + ARC.rx} ${ARC.cy}`}
            fill="none"
            stroke="url(#arcGold)"
            strokeWidth={blur ? 10 : 2.5}
            filter={blur ? 'url(#arcGlow)' : undefined}
            opacity={blur ? 0.6 : 1}
            pathLength={1}
            strokeDasharray={`${arcT} 1`}
          />
        ))}
      </svg>
      {ICONS.map((icon, i) => {
        const phi = Math.PI - ((i + 0.5) / ICONS.length) * Math.PI;
        const x = ARC.cx + ARC.rx * Math.cos(phi);
        const y = ARC.cy - ARC.ry * Math.sin(phi);
        const p = pop(frame, 40 + i * 9, 140, 12);
        const big = i === 2;
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${p})` }}>
            <IconBadge size={big ? 92 : 70}>{icon}</IconBadge>
          </div>
        );
      })}

      <Stage3D>
        <group position={[0, 0.35, 0]} rotation={[0.1, 0, 0]}>
          <Pedestal frame={frame} y={-1.3} radius={5.4} z={-2.4} />
          {LINEUP.map((id, i) => {
            const s = arcSlot(i, LINEUP.length, 0.175, 10);
            const p = pop(frame, s.center * 5, 100, 16);
            const big = id.endsWith('-7');
            const h = big ? 2.4 : 2.15;
            return (
              <Book
                key={id}
                cover={cover(id)}
                height={h}
                position={[s.x, -1.3 + h / 2, s.z - (1 - p) * 4]}
                rotation={[0, s.ry, 0]}
                opacity={Math.min(1, p * 1.5)}
                sweep={ramp(frame, 120 + i * 5, 160 + i * 5, -0.45, 1.85)}
                glow={big ? 0.5 * ramp(frame, 60, 110) : 0}
              />
            );
          })}
          <Dust frame={frame + 1600} seed={5} />
        </group>
      </Stage3D>

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 48 }}>
        <RevealTitle text="Bu darsliklar nafaqat bilim beradi," frame={frame} start={70} size={66} stagger={3} />
        <div style={{ height: 12 }} />
        <RevealTitle
          text="balki fikrlaydigan, izlanuvchan, mas’uliyatli"
          frame={frame}
          start={92}
          size={32}
          gold={false}
          weight={600}
          font={theme.body}
          tracking={0.08}
          stagger={2}
        />
        <div style={{ height: 6 }} />
        <RevealTitle
          text="va zamonaviy avlodni tarbiyalaydi."
          frame={frame}
          start={104}
          size={32}
          gold={false}
          weight={600}
          font={theme.body}
          tracking={0.08}
          stagger={2}
        />
        <div style={{ height: 16 }} />
        <Ornament frame={frame} start={118} width={300} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
