// Simple line icons drawn for the film (stroke = currentColor).
type P = { size?: number; color?: string };
const wrap = (d: React.ReactNode, { size = 28, color = '#ffe3a1' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
export const IconLink = (p: P) => wrap(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>, p);
export const IconLeaf = (p: P) => wrap(<><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19 13 11" /></>, p);
export const IconSpark = (p: P) => wrap(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></>, p);
export const IconBulb = (p: P) => wrap(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>, p);
export const IconPeople = (p: P) => wrap(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M15 14.2c3 .2 5.5 2.6 5.5 5.8" /></>, p);
export const IconCap = (p: P) => wrap(<><path d="M2 9.5 12 5l10 4.5L12 14 2 9.5Z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" /><path d="M22 9.5V15" /></>, p);
export const IconChart = (p: P) => wrap(<><path d="M4 20h16" /><path d="M7 16v-4M11 16V9M15 16v-6M19 16V6" /><path d="m6 9 4-3 4 2 5-4" /></>, p);
export const IconFlask = (p: P) => wrap(<><path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></>, p);
export const IconCompass = (p: P) => wrap(<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>, p);
export const IconMagnet = (p: P) => wrap(<><path d="M6 3v8a6 6 0 0 0 12 0V3" /><path d="M6 7h4M14 7h4" /><path d="M10 3v8a2 2 0 0 0 4 0V3" /></>, p);
