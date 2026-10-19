import { Composition } from 'remotion';
import { Film } from './Film';
import { DURATION, FPS, HEIGHT, WIDTH } from './timeline';

export const RemotionRoot: React.FC = () => (
  <Composition id="TextbookFilm" component={Film} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
);
