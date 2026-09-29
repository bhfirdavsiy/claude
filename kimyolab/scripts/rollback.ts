import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {rollbackContentRoot} from './release-pointer-io.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv[2];
try{
  const result=rollbackContentRoot(root,requested);
  console.log(JSON.stringify(result));
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
}
