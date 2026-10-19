export const theme = {
  navy950: '#030817',
  navy900: '#06112b',
  navy800: '#0b1d47',
  navy700: '#13306e',
  blue: '#3d7bff',
  cyan: '#5fd0ff',
  gold: '#e8b64c',
  goldLight: '#ffe3a1',
  goldDeep: '#b8862b',
  ivory: '#f6efe0',
  text: '#eaf0ff',
  muted: '#9fb0d6',
  display: '"Oswald", "Arial Narrow", sans-serif',
  body: '"Montserrat", "Segoe UI", sans-serif',
} as const;

export const goldText: React.CSSProperties = {
  background: 'linear-gradient(180deg, #fff3cf 0%, #f4cf7a 38%, #e0a63c 62%, #fff0c4 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  filter: 'drop-shadow(0 4px 18px rgba(232,182,76,0.35))',
};
