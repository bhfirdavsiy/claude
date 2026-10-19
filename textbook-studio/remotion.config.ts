// Config for `npx remotion studio` / `npx remotion render`.
// Assets are served read-only from the repository-root public/ folder.
import { Config } from '@remotion/cli/config';

Config.setPublicDir('../public');
Config.setEntryPoint('src/remotion/index.ts');
Config.setVideoImageFormat('png');
Config.setChromiumOpenGlRenderer('angle');
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setMuted(true);
