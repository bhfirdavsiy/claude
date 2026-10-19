import { useEffect, useState } from 'react';
import { AbsoluteFill, cancelRender, continueRender, delayRender, Sequence, useCurrentFrame } from 'remotion';
import { covers } from './assets';
import { preloadCovers } from './three/textures';
import { ramp } from './anim';
import { Background, FilmFinish } from './components/Background';
import { ensureFonts } from './fonts';
import { Scene1Intro } from './scenes/Scene1Intro';
import { Scene2Primary } from './scenes/Scene2Primary';
import { Scene3Grade7 } from './scenes/Scene3Grade7';
import { Scene4Inside } from './scenes/Scene4Inside';
import { Scene5Global } from './scenes/Scene5Global';
import { Scene6Finale } from './scenes/Scene6Finale';
import { DURATION, OVERLAP, SCENES, type SceneId } from './timeline';

const COMPONENTS: Record<SceneId, React.FC> = {
  intro: Scene1Intro,
  primary: Scene2Primary,
  grade7: Scene3Grade7,
  inside: Scene4Inside,
  global: Scene5Global,
  finale: Scene6Finale,
};

/** Cross-dissolve wrapper: each scene fades in over OVERLAP frames on top of the previous one. */
const Dissolve: React.FC<{ children: React.ReactNode; first: boolean }> = ({ children, first }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: first ? 1 : ramp(frame, 0, OVERLAP) }}>{children}</AbsoluteFill>;
};

/** Mounts the scenes only after all nine cover textures are decoded. */
const CoverGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender('Loading textbook covers', { timeoutInMilliseconds: 60000 }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    preloadCovers(covers).then(() => setReady(true), cancelRender);
  }, []);
  useEffect(() => {
    // Released after the scenes have mounted, so their own delayRender calls are registered.
    if (ready) continueRender(handle);
  }, [ready, handle]);
  return ready ? <>{children}</> : null;
};

export const Film: React.FC = () => {
  ensureFonts();
  const frame = useCurrentFrame();
  const fadeOut = ramp(frame, DURATION - 18, DURATION - 1);
  return (
    <AbsoluteFill style={{ backgroundColor: '#020611', overflow: 'hidden' }}>
      <Background />
      <CoverGate>
      {SCENES.map((s, i) => {
        const Scene = COMPONENTS[s.id];
        const last = i === SCENES.length - 1;
        return (
          <Sequence key={s.id} name={s.title} from={s.start} durationInFrames={s.duration + (last ? 0 : OVERLAP)} premountFor={45}>
            <Dissolve first={i === 0}>
              <Scene />
            </Dissolve>
          </Sequence>
        );
      })}
      </CoverGate>
      <FilmFinish />
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
