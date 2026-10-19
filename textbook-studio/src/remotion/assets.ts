import { staticFile } from 'remotion';
import manifest from '../assets.manifest.json';

export type Cover = (typeof manifest.covers)[number];
export type Example = (typeof manifest.examples)[number];

export const covers: Cover[] = manifest.covers;
export const examples: Example[] = manifest.examples;

export function cover(id: string): Cover {
  const c = covers.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown cover ${id}`);
  return c;
}

export function example(id: string): Example {
  const e = examples.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown example ${id}`);
  return e;
}

// The website (Vite) sets a base so assets resolve relative to wherever the site is hosted,
// including under a sub-path. Remotion renders leave it unset and use staticFile().
let assetBase: string | null = null;
export function setAssetBase(base: string) {
  assetBase = base;
}

/** URL of an original asset (served from the repository-root public/ folder). */
export const assetUrl = (file: string) => (assetBase !== null ? `${assetBase}${file}` : staticFile(file));

/** Aspect ratio (w/h) of the printed cover inside its padded source image. */
export const coverAspect = (c: Cover) => (c.crop[2] - c.crop[0]) / (c.crop[3] - c.crop[1]);
