// P2.8 — cross-platform artefact comparison (CI): the deployment manifests built on Linux and on Windows from the same
// commit and configuration must describe the SAME bytes: tree sha256, file count and every per-file sha256.
// Usage: node scripts/compare-deploy-manifests.mjs <linux.manifest.json> <windows.manifest.json>
import fs from 'node:fs';

const [a, b] = process.argv.slice(2).map((f) => ({file: f, m: JSON.parse(fs.readFileSync(f, 'utf8'))}));
const map = (m) => new Map(m.files.map((f) => [f.path, f.sha256]));
const ma = map(a.m), mb = map(b.m);
const differing = [...new Set([...ma.keys(), ...mb.keys()])].filter((p) => ma.get(p) !== mb.get(p)).sort();
const result = {
  status: a.m.sha256 === b.m.sha256 && a.m.fileCount === b.m.fileCount && differing.length === 0 && JSON.stringify(a.m.config) === JSON.stringify(b.m.config) ? 'IDENTICAL' : 'DIFFERENT',
  treeSha256: [a.m.sha256, b.m.sha256], fileCount: [a.m.fileCount, b.m.fileCount], totalBytes: [a.m.totalBytes, b.m.totalBytes],
  differingFiles: differing.slice(0, 50), differingCount: differing.length,
};
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'IDENTICAL') { console.error(`DEPLOY_NOT_REPRODUCIBLE: the ${a.file} and ${b.file} artefacts differ (${differing.length} file(s)). Both platforms must build the same bytes.`); process.exitCode = 1; }
