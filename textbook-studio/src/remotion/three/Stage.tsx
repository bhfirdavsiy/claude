import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { useMemo } from 'react';
import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_Z, seeded } from '../anim';
import { glowTexture } from './textures';

/** Transparent WebGL layer with the shared camera and a warm/cool studio light rig. */
export const Stage3D: React.FC<{ children: React.ReactNode; exposure?: number }> = ({ children, exposure = 1 }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas
      width={width}
      height={height}
      flat
      dpr={1}
      camera={{ fov: CAMERA_FOV, position: [0, 0, CAMERA_Z], near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ambientLight intensity={0.55 * exposure} color="#c9d6ff" />
      <directionalLight position={[3, 5, 9]} intensity={1.1 * exposure} color="#fff1d6" />
      <directionalLight position={[-6, 2, 4]} intensity={0.35 * exposure} color="#7fa8ff" />
      <pointLight position={[0, 2.5, -7]} intensity={7 * exposure} distance={12} color="#4d7dff" />
      {children}
    </ThreeCanvas>
  );
};

/** Circular navy/gold pedestal with glowing rings. */
export const Pedestal: React.FC<{ y?: number; radius?: number; frame: number; opacity?: number; z?: number }> = ({
  y = -1.4,
  radius = 6,
  frame,
  opacity = 1,
  z = -1.5,
}) => {
  const ringRot = frame * 0.004;
  return (
    <group position={[0, y, z]}>
      <mesh position={[0, -0.18, 0]}>
        <cylinderGeometry args={[radius, radius * 1.02, 0.36, 128]} />
        <meshStandardMaterial color="#132a5e" metalness={0.35} roughness={0.45} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.06, radius, 160]} />
        <meshBasicMaterial color="#ffcf73" transparent opacity={opacity} />
      </mesh>
      {[0.82, 0.62, 0.42].map((k, i) => (
        <mesh key={k} position={[0, 0.006 + i * 0.001, 0]} rotation={[-Math.PI / 2, 0, ringRot * (i % 2 ? -1 : 1)]}>
          <ringGeometry args={[radius * k - 0.015, radius * k, 160, 1, 0, Math.PI * (1.2 + i * 0.25)]} />
          <meshBasicMaterial color={i === 1 ? '#7fb2ff' : '#e8b64c'} transparent opacity={0.55 * opacity} />
        </mesh>
      ))}
      <mesh position={[0, -0.36, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.0, radius * 1.25, 128]} />
        <meshBasicMaterial color="#3d7bff" transparent opacity={0.18 * opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.02, radius * 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[radius * 2.6, radius * 0.9]} />
        <meshBasicMaterial map={glowTexture()} color="#ffcc66" transparent opacity={0.22 * opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};

/** Drifting golden dust motes (seeded, frame-driven). */
export const Dust: React.FC<{ frame: number; count?: number; seed?: number; opacity?: number; color?: string }> = ({
  frame,
  count = 220,
  seed = 7,
  opacity = 1,
  color = '#ffd88a',
}) => {
  const { base, geometry } = useMemo(() => {
    const r = seeded(seed);
    const pts = Array.from({ length: count }, () => [(r() - 0.5) * 22, (r() - 0.5) * 12, -2 - r() * 10, 0.4 + r(), r() * 6.28]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return { base: pts, geometry: g };
  }, [count, seed]);

  const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    const [x, y, z, sp, ph] = base[i];
    attr.setXYZ(i, x + Math.sin(frame * 0.01 * sp + ph) * 0.4, ((y + frame * 0.006 * sp + 6) % 12) - 6, z);
  }
  attr.needsUpdate = true;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={glowTexture()}
        color={color}
        size={0.09}
        sizeAttenuation
        transparent
        opacity={0.8 * opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
