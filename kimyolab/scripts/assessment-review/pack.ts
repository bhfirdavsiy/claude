import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPackets} from './lib.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
console.log(JSON.stringify(buildPackets(root)));
