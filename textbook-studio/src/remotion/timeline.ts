// Single source of truth for the 60-second film (30 fps, 1800 frames).
// Timing follows references/approved_storyboard.png.
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 60 * FPS;
/** Frames by which each scene overlaps the next for a cross-dissolve. */
export const OVERLAP = 15;

export type SceneId = 'intro' | 'primary' | 'grade7' | 'inside' | 'global' | 'finale';

export const SCENES: { id: SceneId; label: string; title: string; start: number; duration: number }[] = [
  { id: 'intro', label: '0:00–0:08', title: 'Yangi avlod darsliklari', start: 0, duration: 8 * FPS },
  { id: 'primary', label: '0:08–0:20', title: '1–3-sinf darsliklari', start: 8 * FPS, duration: 12 * FPS },
  { id: 'grade7', label: '0:20–0:35', title: '7-sinf: matematika, fizika, kimyo', start: 20 * FPS, duration: 15 * FPS },
  { id: 'inside', label: '0:35–0:45', title: 'Darslik ichidan: real misollar', start: 35 * FPS, duration: 10 * FPS },
  { id: 'global', label: '0:45–0:53', title: 'Xalqaro tajriba', start: 45 * FPS, duration: 8 * FPS },
  { id: 'finale', label: '0:53–1:00', title: 'Zamonaviy avlod tarbiyasi', start: 53 * FPS, duration: 7 * FPS },
];
