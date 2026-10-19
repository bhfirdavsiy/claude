import * as THREE from 'three';
import { assetUrl, type Cover } from '../assets';

const cache = new Map<string, Promise<THREE.Texture>>();

/**
 * Loads an original cover image as a texture. The white padding around the printed
 * cover is removed with UV offset/repeat only — the source file is never altered.
 * <CoverGate> blocks rendering (delayRender) until every texture is ready, so every
 * exported frame shows the real covers.
 */
function loadCover(c: Cover) {
  const url = assetUrl(c.file);
  let p = cache.get(url);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          const [x0, y0, x1, y1] = c.crop;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.repeat.set((x1 - x0) / c.width, (y1 - y0) / c.height);
          tex.offset.set(x0 / c.width, 1 - y1 / c.height);
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        () => reject(new Error(`Failed to load ${url}`)),
      );
    });
    cache.set(url, p);
  }
  return p;
}

const loaded = new Map<string, THREE.Texture>();

/** Preloads every cover; resolves once all textures are decoded. */
export function preloadCovers(list: Cover[]) {
  return Promise.all(
    list.map((c) =>
      loadCover(c).then((t) => {
        loaded.set(c.file, t);
      }),
    ),
  );
}

/** Synchronous access to a preloaded cover texture (see <CoverGate>). */
export function useCoverTexture(c: Cover) {
  return loaded.get(c.file) ?? null;
}

// ---- Procedural (deterministic) helper textures -------------------------------------

let glowTex: THREE.Texture | null = null;
/** Soft radial glow, white centre → transparent. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(canvas);
  return glowTex;
}

const pageTex: Record<string, THREE.Texture> = {};
/** Stacked-paper edge texture. `axis` selects the stripe direction. */
export function pagesTexture(axis: 'u' | 'v') {
  if (pageTex[axis]) return pageTex[axis];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f3ecdc';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    ctx.fillStyle = i % 6 === 0 ? 'rgba(150,130,100,0.35)' : 'rgba(170,150,120,0.15)';
    if (axis === 'u') ctx.fillRect(i, 0, 1, 128);
    else ctx.fillRect(0, i, 128, 1);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  pageTex[axis] = t;
  return t;
}
