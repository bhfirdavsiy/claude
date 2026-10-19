import { ramp } from '../anim';
import { goldText, theme } from '../theme';

/** Cinematic word-by-word reveal (rise + de-blur + tracking). */
export const RevealTitle: React.FC<{
  text: string;
  frame: number;
  start: number;
  size: number;
  gold?: boolean;
  weight?: number;
  font?: string;
  tracking?: number;
  stagger?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ text, frame, start, size, gold = true, weight = 600, font = theme.display, tracking = 0.04, stagger = 4, color = theme.text, style }) => {
  const words = text.split(' ');
  return (
    <div
      style={{
        fontFamily: font,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.08,
        textTransform: 'uppercase',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        letterSpacing: `${tracking + (1 - ramp(frame, start, start + 40)) * 0.18}em`,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const t = ramp(frame, start + i * stagger, start + i * stagger + 24);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: i < words.length - 1 ? '0.26em' : 0,
              opacity: t,
              transform: `translateY(${(1 - t) * 0.5}em)`,
              filter: `blur(${(1 - t) * 10}px)`,
              ...(gold ? goldText : { color }),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Gold rule — diamond — gold rule, drawn outwards from the centre. */
export const Ornament: React.FC<{ frame: number; start: number; width?: number }> = ({ frame, start, width = 420 }) => {
  const t = ramp(frame, start, start + 30);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, height: 16 }}>
      <div style={{ width: (width / 2) * t, height: 1.5, background: `linear-gradient(90deg, transparent, ${theme.gold})` }} />
      <div style={{ width: 10, height: 10, transform: `rotate(45deg) scale(${t})`, background: theme.goldLight, boxShadow: `0 0 14px ${theme.gold}` }} />
      <div style={{ width: (width / 2) * t, height: 1.5, background: `linear-gradient(270deg, transparent, ${theme.gold})` }} />
    </div>
  );
};

/** Glass card with gold hairline. */
export const GlassChip: React.FC<{
  frame: number;
  start: number;
  children: React.ReactNode;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
  from?: 'left' | 'right' | 'up';
}> = ({ frame, start, children, icon, style, from = 'right' }) => {
  const t = ramp(frame, start, start + 22);
  const dx = from === 'right' ? 60 : from === 'left' ? -60 : 0;
  const dy = from === 'up' ? 40 : 0;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '18px 26px',
        borderRadius: 18,
        background: 'linear-gradient(135deg, rgba(23,48,110,0.72), rgba(8,20,52,0.78))',
        border: '1px solid rgba(232,182,76,0.45)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
        color: theme.text,
        fontFamily: theme.body,
        opacity: t,
        transform: `translate(${(1 - t) * dx}px, ${(1 - t) * dy}px)`,
        ...style,
      }}
    >
      {icon}
      <div>{children}</div>
    </div>
  );
};

export const IconBadge: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size = 52, color = theme.gold }) => (
  <div
    style={{
      width: size,
      height: size,
      flex: 'none',
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.2), rgba(255,255,255,0.02))`,
      border: `1.5px solid ${color}`,
      boxShadow: `0 0 18px ${color}55`,
    }}
  >
    {children}
  </div>
);
