import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { project, ramp, rampInOut } from '../anim';
import { GlassChip, Ornament, RevealTitle } from '../components/Typography';
import { theme } from '../theme';
import { glowTexture } from '../three/textures';
import { Stage3D } from '../three/Stage';

// 0:45–0:53 — international experience: a data-globe with arcs from Tashkent to
// Helsinki (Education Alliance Finland) and Singapore (5E model).

const R = 2.45;
const CENTER = new THREE.Vector3(0, -0.55, 0);
const deg = Math.PI / 180;

const PLACES = {
  tashkent: { lat: 41.3, lon: 69.24, color: '#ffd27a' },
  helsinki: { lat: 60.17, lon: 24.94, color: '#ffffff' },
  singapore: { lat: 1.35, lon: 103.82, color: '#ff6b78' },
};

function latLon(lat: number, lon: number, r = R) {
  return new THREE.Vector3(r * Math.cos(lat * deg) * Math.sin(lon * deg), r * Math.sin(lat * deg), r * Math.cos(lat * deg) * Math.cos(lon * deg));
}

function arcPoints(a: THREE.Vector3, b: THREE.Vector3, lift = 1.45, n = 96) {
  const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * lift);
  return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(n);
}

const FIVE_E = ['Qiziqtirish', 'Izlanish', 'Tushuntirish', 'Chuqurlashtirish', 'Baholash'];

const FinlandFlag = () => (
  <svg width={66} height={40} viewBox="0 0 18 11" style={{ borderRadius: 4, flex: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
    <rect width="18" height="11" fill="#fff" />
    <rect x="5" width="3" height="11" fill="#002f6c" />
    <rect y="4" width="18" height="3" fill="#002f6c" />
  </svg>
);

const SingaporeFlag = () => {
  const stars = Array.from({ length: 5 }, (_, i) => {
    const a = (-90 + i * 72) * deg;
    return [10.2 + Math.cos(a) * 1.55, 5 + Math.sin(a) * 1.55] as const;
  });
  const star = (cx: number, cy: number, r: number) =>
    Array.from({ length: 10 }, (_, k) => {
      const a = (-90 + k * 36) * deg;
      const rr = k % 2 ? r * 0.4 : r;
      return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
    }).join(' ');
  return (
    <svg width={60} height={40} viewBox="0 0 30 20" style={{ borderRadius: 4, flex: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
      <rect width="30" height="20" fill="#fff" />
      <rect width="30" height="10" fill="#ef3340" />
      <circle cx="7.4" cy="5" r="3.7" fill="#fff" />
      <circle cx="8.9" cy="5" r="3.7" fill="#ef3340" />
      {stars.map(([x, y], i) => (
        <polygon key={i} points={star(x, y, 0.62)} fill="#fff" />
      ))}
    </svg>
  );
};

export const Scene5Global: React.FC = () => {
  const frame = useCurrentFrame();
  // Globe orientation: Uzbekistan faces the camera, slowly turning east.
  const spin = -(68 - frame * 0.07) * deg;
  const tilt = 26 * deg;
  const rise = rampInOut(frame, 0, 60);
  const offset = new THREE.Vector3(CENTER.x, CENTER.y + (rise - 1) * 2, CENTER.z);
  // Same transform as the 3D group, used to pin DOM labels to the markers.
  const toWorld = (v: THREE.Vector3) => v.clone().applyEuler(new THREE.Euler(tilt, spin, 0, 'XYZ')).add(offset);

  const { dots, grid, arcs } = useMemo(() => {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const rr = Math.sqrt(1 - y * y);
      const th = golden * i;
      pos.set([Math.cos(th) * rr * R * 1.002, y * R * 1.002, Math.sin(th) * rr * R * 1.002], i * 3);
    }
    const dotsGeo = new THREE.BufferGeometry();
    dotsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const gridGroup = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: '#5b93ff', transparent: true, opacity: 0.35 });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = Array.from({ length: 129 }, (_, k) => latLon(lat, (k / 128) * 360, R * 1.004));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const pts = Array.from({ length: 129 }, (_, k) => latLon(-90 + (k / 128) * 180, lon, R * 1.004));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    const t = latLon(PLACES.tashkent.lat, PLACES.tashkent.lon);
    const arcLines = (['helsinki', 'singapore'] as const).map((k) => {
      const pts = arcPoints(t, latLon(PLACES[k].lat, PLACES[k].lon));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: k === 'helsinki' ? '#bfe3ff' : '#ff9aa4', transparent: true, opacity: 0.95 }),
      );
      return { key: k, line, pts };
    });
    return { dots: dotsGeo, grid: gridGroup, arcs: arcLines };
  }, []);

  const arcT = [ramp(frame, 50, 100), ramp(frame, 70, 120)];
  arcs.forEach((a, i) => a.line.geometry.setDrawRange(0, Math.floor(arcT[i] * a.pts.length)));

  const labels = (Object.keys(PLACES) as (keyof typeof PLACES)[]).map((k) => {
    const w = toWorld(latLon(PLACES[k].lat, PLACES[k].lon));
    return { k, ...project(w.x, w.y, w.z), front: w.z - offset.z > 0.2 };
  });

  return (
    <AbsoluteFill>
      <Stage3D>
        <group position={offset} rotation={[tilt, spin, 0]}>
          <mesh>
            <sphereGeometry args={[R * 0.99, 96, 96]} />
            <meshStandardMaterial color="#071a45" emissive="#123a8f" emissiveIntensity={0.6} roughness={0.6} metalness={0.2} />
          </mesh>
          <points geometry={dots}>
            <pointsMaterial color="#9cc9ff" size={0.034} sizeAttenuation transparent opacity={0.85 * rise} />
          </points>
          <primitive object={grid} />
          {arcs.map((a, i) => (
            <group key={a.key}>
              <primitive object={a.line} />
              {arcT[i] > 0 && arcT[i] < 1 && (
                <sprite position={a.pts[Math.floor(arcT[i] * (a.pts.length - 1))]} scale={[0.5, 0.5, 1]}>
                  <spriteMaterial map={glowTexture()} color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
                </sprite>
              )}
            </group>
          ))}
          {(Object.keys(PLACES) as (keyof typeof PLACES)[]).map((k, i) => {
            const p = latLon(PLACES[k].lat, PLACES[k].lon, R * 1.01);
            const on = k === 'tashkent' ? ramp(frame, 35, 55) : arcT[i - 1] >= 1 ? 1 : 0;
            const pulse = 1 + 0.35 * Math.sin(frame / 6 + i);
            return (
              <group key={k} position={p}>
                <mesh>
                  <sphereGeometry args={[0.05, 16, 16]} />
                  <meshBasicMaterial color={PLACES[k].color} transparent opacity={on} />
                </mesh>
                <sprite scale={[0.55 * pulse, 0.55 * pulse, 1]}>
                  <spriteMaterial map={glowTexture()} color={PLACES[k].color} transparent opacity={on} blending={THREE.AdditiveBlending} depthWrite={false} />
                </sprite>
              </group>
            );
          })}
        </group>
        {/* atmosphere */}
        <sprite position={[offset.x, offset.y, -1]} scale={[R * 3.1, R * 3.1, 1]}>
          <spriteMaterial map={glowTexture()} color="#3d7bff" transparent opacity={0.55 * rise} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      </Stage3D>

      {/* marker labels */}
      {labels.map((l) => {
        const names = { tashkent: 'O‘ZBEKISTON', helsinki: 'FINLANDIYA', singapore: 'SINGAPUR' } as const;
        const t = l.k === 'tashkent' ? ramp(frame, 45, 65) : l.k === 'helsinki' ? ramp(frame, 100, 115) : ramp(frame, 120, 135);
        return (
          <div
            key={l.k}
            style={{
              position: 'absolute',
              left: l.x,
              top: l.y,
              transform: `translate(${l.k === 'singapore' ? '18px' : '-50%'}, ${l.k === 'singapore' ? '-50%' : '-170%'})`,
              opacity: t * (l.front ? 1 : 0),
              fontFamily: theme.display,
              fontSize: 20,
              letterSpacing: '0.16em',
              color: PLACES[l.k].color,
              textShadow: '0 2px 10px rgba(0,0,0,0.8)',
              whiteSpace: 'nowrap',
            }}
          >
            {names[l.k]}
          </div>
        );
      })}

      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 40 }}>
        <RevealTitle text="Xalqaro tajriba" frame={frame} start={10} size={96} />
        <div style={{ height: 6 }} />
        <RevealTitle
          text="Yanada keng imkoniyatlar"
          frame={frame}
          start={28}
          size={30}
          gold={false}
          weight={500}
          font={theme.body}
          tracking={0.24}
        />
        <div style={{ height: 10 }} />
        <Ornament frame={frame} start={36} width={420} />
      </AbsoluteFill>

      <GlassChip frame={frame} start={95} from="left" icon={<FinlandFlag />} style={{ position: 'absolute', left: 110, top: 400, width: 470 }}>
        <div style={{ fontFamily: theme.display, fontSize: 34, color: theme.text, lineHeight: 1.1 }}>Finlandiya ta’lim alyansi</div>
        <div style={{ fontSize: 18, letterSpacing: '0.18em', color: theme.goldLight, marginTop: 6, fontWeight: 600 }}>SIFAT VA INNOVATSIYA</div>
      </GlassChip>
      <GlassChip frame={frame} start={115} from="right" icon={<SingaporeFlag />} style={{ position: 'absolute', right: 110, top: 400, width: 470 }}>
        <div style={{ fontFamily: theme.display, fontSize: 34, color: theme.text, lineHeight: 1.1 }}>Singapurning 5E modeli</div>
        <div style={{ fontSize: 18, letterSpacing: '0.18em', color: theme.goldLight, marginTop: 6, fontWeight: 600 }}>ZAMONAVIY YONDASHUV</div>
      </GlassChip>

      {/* 5E sequence */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 58, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        {FIVE_E.map((s, i) => {
          const t = ramp(frame, 140 + i * 9, 160 + i * 9);
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
              <div
                style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  border: '1px solid rgba(232,182,76,0.55)',
                  background: 'rgba(10,26,64,0.75)',
                  fontFamily: theme.body,
                  fontWeight: 600,
                  fontSize: 21,
                  color: theme.text,
                }}
              >
                <span style={{ color: theme.goldLight, fontFamily: theme.display, marginRight: 8 }}>{i + 1}E</span>
                {s}
              </div>
              {i < FIVE_E.length - 1 && <div style={{ color: theme.gold, fontSize: 22 }}>→</div>}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
