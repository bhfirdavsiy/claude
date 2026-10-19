import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { lerp, pop, project, ramp } from '../anim';
import { cover } from '../assets';
import { IconLeaf, IconLink, IconSpark, IconBulb } from '../components/Icons';
import { GlassChip, IconBadge, Ornament, RevealTitle } from '../components/Typography';
import { theme } from '../theme';
import { Book } from '../three/Book';
import { Dust, Stage3D } from '../three/Stage';

// 0:08–0:20 — primary school (grades 1–3; no grade 4 per README_ASSETS.txt).
// Each grade column shows its two real books; four value cards build up on the right.

const GRADES = [
  { grade: 1, x: -4.75, books: ['alifbe-1', 'informatika-1'] },
  { grade: 2, x: -1.85, books: ['matematika-2', 'informatika-mashq-2'] },
  { grade: 3, x: 1.05, books: ['matematika-3', 'informatika-mashq-3'] },
];

const VALUES = [
  { icon: <IconLink />, title: 'Fanlararo bog‘liqlik', body: 'Barcha fanlar o‘zaro bog‘langan' },
  { icon: <IconLeaf />, title: 'Qadriyatlar', body: 'Ekologik tarbiya, milliy va umuminsoniy qadriyatlar' },
  { icon: <IconSpark />, title: 'Zamonaviy savodxonlik', body: 'Raqamli, moliyaviy va emotsional savodxonlik' },
  { icon: <IconBulb />, title: 'Fikrlashga undovchi mashqlar', body: 'O‘quvchi o‘ylaydi, izlanadi, xulosa chiqaradi' },
];

const BOOK_Y = -0.55;
const BOOK_H = 2.25;

export const Scene2Primary: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 0.06;

  return (
    <AbsoluteFill>
      <Stage3D>
        <group rotation={[0.03, drift, 0]}>
          {GRADES.map((g, gi) => {
            const p = pop(frame, 30 + gi * 22, 85, 15);
            const focus = ramp(frame, 150 + gi * 40, 180 + gi * 40) * (1 - ramp(frame, 190 + gi * 40, 230 + gi * 40));
            const float = Math.sin((frame + gi * 40) / 45) * 0.06;
            return (
              <group key={g.grade} position={[g.x, BOOK_Y + float + (1 - p) * -2.2, (1 - p) * -5 + focus * 0.5]} rotation={[0, (1 - p) * 0.8, 0]}>
                <Book
                  cover={cover(g.books[1])}
                  height={BOOK_H * 0.94}
                  position={[0.62, 0.22, -0.35]}
                  rotation={[0, -0.2, 0.05]}
                  opacity={Math.min(1, p * 1.5)}
                  shadow={false}
                />
                <Book
                  cover={cover(g.books[0])}
                  height={BOOK_H}
                  position={[-0.25, 0, 0.1]}
                  rotation={[0, 0.16, -0.03]}
                  opacity={Math.min(1, p * 1.5)}
                  sweep={ramp(frame, 120 + gi * 18, 165 + gi * 18, -0.45, 1.85)}
                  highlight={focus}
                  glow={focus}
                  shadow={false}
                />
              </group>
            );
          })}
          <Dust frame={frame + 300} count={160} seed={11} opacity={0.8} />
        </group>
      </Stage3D>

      {/* grade labels under each column */}
      {GRADES.map((g, gi) => {
        const pos = project(g.x + 0.15, BOOK_Y - BOOK_H / 2 - 0.25, 0);
        const t = ramp(frame, 55 + gi * 22, 80 + gi * 22);
        return (
          <div
            key={g.grade}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, ${(1 - t) * 20}px)`,
              opacity: t,
              textAlign: 'center',
              fontFamily: theme.display,
              color: theme.goldLight,
              fontSize: 34,
              letterSpacing: '0.12em',
            }}
          >
            {g.grade}-SINF
            <div style={{ margin: '8px auto 0', width: 90, height: 2, background: `linear-gradient(90deg, transparent, ${theme.gold}, transparent)` }} />
          </div>
        );
      })}

      {/* title */}
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 70 }}>
        <RevealTitle text="1–3-sinf darsliklari" frame={frame} start={8} size={92} />
        <div style={{ height: 10 }} />
        <RevealTitle
          text="Bilim, ko‘nikma va qadriyatlar birligi"
          frame={frame}
          start={30}
          size={32}
          gold={false}
          weight={500}
          font={theme.body}
          tracking={0.18}
          stagger={3}
        />
        <div style={{ height: 14 }} />
        <Ornament frame={frame} start={40} width={460} />
      </AbsoluteFill>

      {/* value cards */}
      <div style={{ position: 'absolute', right: 70, top: 330, width: 520, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {VALUES.map((v, i) => (
          <GlassChip key={v.title} frame={frame} start={140 + i * 40} icon={<IconBadge>{v.icon}</IconBadge>}>
            <div style={{ fontFamily: theme.display, fontSize: 30, letterSpacing: '0.03em', color: theme.goldLight, textTransform: 'uppercase' }}>{v.title}</div>
            <div style={{ fontSize: 20, lineHeight: 1.35, color: theme.text, opacity: 0.9, marginTop: 4 }}>{v.body}</div>
          </GlassChip>
        ))}
      </div>

      {/* connecting thread between the grades */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {GRADES.slice(0, -1).map((g, gi) => {
          const a = project(g.x + 0.15, BOOK_Y - BOOK_H / 2 - 0.05, 0);
          const b = project(GRADES[gi + 1].x + 0.15, BOOK_Y - BOOK_H / 2 - 0.05, 0);
          const t = ramp(frame, 150 + gi * 15, 190 + gi * 15);
          const mx = lerp(a.x, b.x, 0.5);
          return (
            <path
              key={gi}
              d={`M ${a.x + 70} ${a.y + 26} Q ${mx} ${a.y + 70} ${b.x - 70} ${b.y + 26}`}
              stroke={theme.gold}
              strokeWidth={2}
              fill="none"
              strokeDasharray="6 8"
              pathLength={1}
              style={{ strokeDasharray: `${t} 1`, opacity: 0.8 }}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
