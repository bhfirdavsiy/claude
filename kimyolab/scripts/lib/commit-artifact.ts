// P2.8 — build the deployment artefact of an older COMMIT with that commit's OWN builder (git archive → its
// scripts/build-production.ts) for a given mount. Shared by the rollback drill and the readiness evidence check, so
// both resolve the same rollback baseline. Results are cached per commit inside one temp directory.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {computeTreeHash} from '../deploy-surface-hash.ts';

export function createCommitBuilder(root:string, tmp:string, basePath:string):(commit:string)=>{commit:string;dir:string;sha256:string} {
  const built = new Map<string,{commit:string;dir:string;sha256:string}>();
  const git = (args:string[]) => spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  return function buildCommit(commit:string) {
    const hit = built.get(commit); if (hit) return hit;
    const repoTop = git(['rev-parse', '--show-toplevel']).stdout.trim();
    const sub = path.relative(repoTop, root).split(path.sep).join('/');
    const src = path.join(tmp, `src-${commit.slice(0, 12)}`);
    fs.mkdirSync(src, {recursive: true});
    const archive = spawnSync('git', ['archive', '--format=tar', commit, sub], {cwd: repoTop, maxBuffer: 1 << 30});
    if (archive.status !== 0) throw Object.assign(new Error(`git archive of ${commit} failed`), {code: 'DEPLOY_ROLLBACK_SOURCE_MISSING'});
    const untar = spawnSync('tar', ['-x', '-C', src], {input: archive.stdout, maxBuffer: 1 << 30});
    if (untar.status !== 0) throw Object.assign(new Error(`could not unpack ${commit}`), {code: 'DEPLOY_ROLLBACK_SOURCE_MISSING'});
    const prevRoot = path.join(src, sub);
    const out = path.join(tmp, `artifact-${commit.slice(0, 12)}`);
    const r = spawnSync(process.execPath, ['--no-warnings', path.join(prevRoot, 'scripts', 'build-production.ts'), out, '--base-path', basePath], {cwd: prevRoot, encoding: 'utf8'});
    if (r.status !== 0) throw Object.assign(new Error(`${commit} could not be built for this mount by its own builder`), {code: 'DEPLOY_ROLLBACK_SOURCE_MISSING'});
    fs.rmSync(path.join(out, 'app.html'), {force: true});
    fs.rmSync(src, {recursive: true, force: true});
    const result = {commit, dir: out, sha256: computeTreeHash(out).sha256};
    built.set(commit, result);
    return result;
  };
}
