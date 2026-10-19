// Fonts are bundled from npm (@fontsource) so rendering works offline.
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import { continueRender, delayRender } from 'remotion';

let started = false;
/** Blocks rendering until every face used by the film has loaded. */
export function ensureFonts() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('fonts');
  const faces = ['500 40px Oswald', '600 40px Oswald', '700 40px Oswald', '400 20px Montserrat', '500 20px Montserrat', '600 20px Montserrat', '700 20px Montserrat'];
  Promise.all(faces.map((f) => document.fonts.load(f, 'AaO‘ʼ’—·')))
    .then(() => document.fonts.ready)
    .finally(() => continueRender(handle));
}
