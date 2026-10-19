import { useMemo } from 'react';
import * as THREE from 'three';
import { coverAspect, type Cover } from '../assets';
import { glowTexture, pagesTexture, useCoverTexture } from './textures';

type Vec3 = [number, number, number];

const sweepVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const sweepFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uSweep;
  uniform float uStrength;
  void main() {
    float d = (vUv.x * 0.8 + vUv.y * 0.6) - uSweep;
    float band = exp(-d * d * 60.0);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * band * uStrength, 1.0);
  }
`;

export type BookProps = {
  cover: Cover;
  height?: number;
  position?: Vec3;
  rotation?: Vec3;
  scale?: number;
  opacity?: number;
  /** Position of the specular light sweep across the cover (-0.5 … 1.9). */
  sweep?: number;
  /** Extra brightness of the cover (focus highlight). */
  highlight?: number;
  /** Warm glow behind the book. */
  glow?: number;
  shadow?: boolean;
};

/** A real textbook as a 3D object: the original cover image on the front face. */
export const Book: React.FC<BookProps> = ({
  cover,
  height = 2.4,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  opacity = 1,
  sweep = -1,
  highlight = 0,
  glow = 0,
  shadow = true,
}) => {
  const tex = useCoverTexture(cover);
  const width = height * coverAspect(cover);
  const depth = cover.kind === 'workbook' ? 0.07 * height : 0.1 * height;
  const transparent = opacity < 0.999;

  const sweepUniforms = useMemo(() => ({ uSweep: { value: -1 }, uStrength: { value: 0 } }), []);
  sweepUniforms.uSweep.value = sweep;
  sweepUniforms.uStrength.value = sweep > -0.5 && sweep < 1.9 ? 0.55 * opacity : 0;

  const spine = useMemo(() => new THREE.Color(cover.spine), [cover.spine]);
  const edgeU = pagesTexture('u');
  const edgeV = pagesTexture('v');

  if (!tex) return null;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {glow > 0 && (
        <mesh position={[0, 0, -depth]} renderOrder={-1}>
          <planeGeometry args={[width * 2.6, height * 1.9]} />
          <meshBasicMaterial map={glowTexture()} color="#ffcf73" transparent opacity={glow * opacity * 0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        {/* +x: page edges */}
        <meshStandardMaterial attach="material-0" map={edgeU} roughness={0.9} transparent={transparent} opacity={opacity} />
        {/* -x: spine */}
        <meshStandardMaterial attach="material-1" color={spine} roughness={0.5} transparent={transparent} opacity={opacity} />
        {/* +y / -y: page edges */}
        <meshStandardMaterial attach="material-2" map={edgeV} roughness={0.9} transparent={transparent} opacity={opacity} />
        <meshStandardMaterial attach="material-3" map={edgeV} roughness={0.9} transparent={transparent} opacity={opacity} />
        {/* +z: the original cover. Emissive copy keeps colours faithful to the print. */}
        <meshStandardMaterial
          attach="material-4"
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={0.42 + highlight * 0.25}
          roughness={0.42}
          metalness={0.05}
          transparent={transparent}
          opacity={opacity}
        />
        {/* -z: back cover */}
        <meshStandardMaterial attach="material-5" color={spine} roughness={0.55} transparent={transparent} opacity={opacity} />
      </mesh>
      {sweepUniforms.uStrength.value > 0 && (
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <planeGeometry args={[width, height]} />
          <shaderMaterial
            vertexShader={sweepVertex}
            fragmentShader={sweepFragment}
            uniforms={sweepUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      {shadow && (
        <mesh position={[0, -height / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width * 1.7, depth * 9]} />
          <meshBasicMaterial map={glowTexture()} color="#000000" transparent opacity={0.55 * opacity} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};
