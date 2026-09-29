// P0 Integrity Release — browser-level checks in real Chromium.
import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {buildDist, cloneDist, startServer} from '../helpers/dist.mjs';

let server;
test.beforeAll(async () => { server = await startServer({publicRoot: buildDist()}); });
test.afterAll(async () => { await server?.close(); });

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test('home and a learning unit load from the built dist without console/CSP errors', async ({page}) => {
  const errors = collectErrors(page);
  await page.goto(`${server.url}/`);
  await expect(page.locator('h1').first()).toBeVisible();
  await page.goto(`${server.url}/learn/lu.7.01/guide`);
  await expect(page.locator('#app-main h1').first()).toBeVisible();
  await expect(page.getByText('Xatolik yuz berdi')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a tampered content file fails closed with an explicit message', async ({page}) => {
  const dist = cloneDist();
  const pointer = JSON.parse(fs.readFileSync(path.join(dist, 'content', 'manifest.json'), 'utf8'));
  const file = path.join(dist, 'content', pointer.activeVersion, 'learning-units', 'grade-7.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"title"', '"titlE"'));
  const tampered = await startServer({publicRoot: dist});
  try {
    await page.goto(`${tampered.url}/learn/lu.7.01/guide`);
    await expect(page.getByText('Kontent fayli tekshiruvdan o‘tmadi.', {exact: false})).toBeVisible();
  } finally { await tampered.close(); }
});

test('real IndexedDB: 20 attempts of one activity are stored as 20 immutable attempts', async ({page}) => {
  await page.goto(`${server.url}/`);
  const result = await page.evaluate(async () => {
    const {BrowserProgressService} = await import('/app-preview/features/progress/service.js');
    const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
    const dbName = `e2e-${Date.now()}`;
    const service = new BrowserProgressService(indexedDB, dbName);
    const pageModel = {id: 'practice.trainer.7.4', type: 'trainer', learningUnit: {id: 'lu.7.04', grade: 7, title: 'x'}, activityVersion: '1', contentVersion: 'V', schemaVersion: '1.0.0', scoringVersion: '1'};
    const draft = {id: 'practice.trainer.7.4.answer.1', conceptId: 'concept.c001', activityId: 'practice.trainer.7.4', activityVersion: '1', contentVersion: 'V', scoringVersion: '1', createdAt: new Date().toISOString(), score: 1, evidenceClass: 'trainer-calculation', type: 'answer', questionId: 'q', correct: true};
    for (let i = 0; i < 20; i++) await service.recordPracticeResult(pageModel, {evidence: [draft], finalState: {status: 'complete'}});
    const store = new IndexedDbProgressStore(indexedDB, dbName);
    const evidence = await store.loadEvidenceForConcept('concept.c001');
    return {attempts: (await store.listAttempts('lu.7.04')).length, evidence: evidence.length, unique: new Set(evidence.map((e) => e.id)).size};
  });
  expect(result).toEqual({attempts: 20, evidence: 20, unique: 20});
});

test('real IndexedDB: a v1 database is migrated to v2 without losing evidence', async ({page}) => {
  await page.goto(`${server.url}/`);
  const result = await page.evaluate(async () => {
    const name = `e2e-v1-${Date.now()}`;
    await new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => { for (const s of ['progress', 'evidence', 'assessmentAttempts', 'mastery', 'appMeta', 'activityState']) open.result.createObjectStore(s); };
      open.onsuccess = () => {
        const db = open.result; const tx = db.transaction(['evidence', 'progress'], 'readwrite');
        tx.objectStore('evidence').put({id: 'legacy.1', conceptId: 'concept.c1', activityId: 'a', activityVersion: '1', contentVersion: 'V', scoringVersion: '1', createdAt: '2026-09-01T00:00:00.000Z', score: 1, evidenceClass: 'trainer-calculation', type: 'answer', questionId: 'q', correct: true}, 'legacy.1');
        tx.objectStore('progress').put({learningUnitId: 'lu.7.01', status: 'complete', activityStates: {}, lastVisitedAt: '2026-09-01T00:00:00.000Z', contentVersion: 'V', schemaVersion: '1.0.0'}, 'lu.7.01');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    const {IndexedDbProgressStore} = await import('/app-preview/runtime/progress/indexeddb-store.js');
    const store = new IndexedDbProgressStore(indexedDB, name);
    const evidence = await store.loadEvidenceForConcept('concept.c1');
    const progress = await store.loadProgress('lu.7.01');
    return {evidence: evidence.length, source: evidence[0]?.sourceEvidenceId, status: progress?.status, schema: progress?.schemaVersion};
  });
  expect(result).toEqual({evidence: 1, source: 'legacy.1', status: 'practice_complete', schema: '2.0.0'});
});
