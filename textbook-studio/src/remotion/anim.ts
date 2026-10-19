import { Easing, interpolate, spring } from 'remotion';
import { FPS, HEIGHT, WIDTH } from './timeline';

// All motion is a pure function of the frame number: no clocks, no Math.random().

const outExpo = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/** Eased 0→1 (or from→to) progress between two frames, clamped. */
export function ramp(frame: number, start: number, end: number, from = 0, to = 1, easing: (t: number) => number = outExpo) {
  return interpolate(frame, [start, end], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
}

export function rampInOut(frame: number, start: number, end: number, from = 0, to = 1) {
  return ramp(frame, start, end, from, to, inOut);
}

/** Critically damped spring starting at `delay`. */
export function pop(frame: number, delay: number, stiffness = 110, damping = 16) {
  return spring({ frame: frame - delay, fps: FPS, config: { stiffness, damping, mass: 1 } });
}

/** Fade in over [inStart, inEnd] and out over [outStart, outEnd]. */
export function inOutFade(frame: number, inStart: number, inEnd: number, outStart: number, outEnd: number) {
  return Math.min(ramp(frame, inStart, inEnd), 1 - ramp(frame, outStart, outEnd, 0, 1, inOut));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shared perspective camera used by every 3D scene, so DOM overlays can be
// placed exactly over 3D objects with `project()`.
export const CAMERA_FOV = 35;
export const CAMERA_Z = 12;

export function project(x: number, y: number, z: number, camZ = CAMERA_Z) {
  const depth = camZ - z;
  const halfH = depth * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
  const halfW = halfH * (WIDTH / HEIGHT);
  return { x: WIDTH / 2 + (x / halfW) * (WIDTH / 2), y: HEIGHT / 2 - (y / halfH) * (HEIGHT / 2), pxPerUnit: HEIGHT / 2 / halfH };
}
