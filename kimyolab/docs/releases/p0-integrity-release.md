# KimyoLab Integrity Release (P0)

Master TT’ning birinchi milestone’i. Maqsad — mavjud funksional imkoniyatlarni o‘zgartirmasdan
poydevorni ishonchli qilish. Bu relizga **yangi pedagogik feature yoki simulation kiritilmagan**
(P1–P3 P0 yopilgunicha Stable’ga kirmaydi).

- Baseline (Wave 0): git tag `kimyolab-baseline-20.1.0` — yetkazilgan checkpoint o‘zgarishsiz, 330/330 test.
- Kontent versiyasi o‘zgarmagan: `2026.09.1` (checksum `de0e88f8…06df`) — content pack bayt-bayt bir xil.

## Tekshirish

```
git clone …
cd kimyolab
npm ci
npx playwright install chromium   # faqat birinchi marta, E2E uchun
npm run verify
```

`verify` zanjiri: `lint → typecheck → schema:validate → content:validate → chemistry:validate → test → test:integration → test:e2e → build`.
Hech qanday global `vite`/`typescript` talab qilinmaydi; barcha devDependency’lar `package-lock.json` orqali aniq versiyada.

## P0 bandlari bo‘yicha holat

| Band | Nima qilindi | Qabul testi |
|---|---|---|
| P0.1 Deployment surface | Server faqat `PUBLIC_ROOT` (standart `dist/`) ni beradi. Allow-list: SPA route’lar, `/index.html`, `/app.html`, `/app-preview/`, `/content/<active\|previous>/`, `/assets/`, `/vendor/nobook/` + kengaytma allow-list. Realpath tekshiruvi (symlink orqali chiqib bo‘lmaydi), dot-fayllar, `..`, `%2e%2e`, double-encoded, backslash, NUL rad etiladi. `dist/` build’da ichki fayllar bo‘lsa build yiqiladi. `dist/` git’dan chiqarildi. | `tests/integration/security-deployment-surface.test.mjs` |
| P0.2 Reproducible build | `package-lock.json`, `tsconfig.json`, aniq pin qilingan `typescript`, `vite`, `ajv`, `ajv-formats`, `@playwright/test`, `fake-indexeddb`, `@types/node`. Majburiy skriptlar va `verify`. `lint` exact pin, lockfile va skriptlarda `npx` yo‘qligini tekshiradi. CI: `.github/workflows/kimyolab-verify.yml`. | `npm ci && npm run verify` |
| P0.3 TypeScript | `tsc --noEmit` (`strict`, `noImplicitAny`) — **0 xato** (boshlanishda 42). `noUncheckedIndexedAccess` ratchet orqali bosqichma-bosqich: `npm run typecheck:next` (hozir 88, faqat kamayishi mumkin — `config/typecheck-ratchet.json`). | `npm run typecheck` |
| P0.4 Immutable evidence | Yangi `Attempt` entity. Har bir saqlangan evidence: UUID `id`, `attemptId`, `learningUnitId`, `sourceEvidenceId` (engine id faqat iz uchun), `correctness`. Evidence store `keyPath:id` + `add()` — mavjud id hech qachon overwrite bo‘lmaydi (`EVIDENCE_ID_COLLISION`). Attempt + evidence bitta atomar tranzaksiyada. `evidence.id = activityId` persistence chegarasida rad etiladi. | `tests/p0-evidence-immutability.test.mjs` (20 marta → 20 Attempt, 20 Evidence), E2E real Chromium’da ham |
| P0.5 Version-safe mastery | `MasteryContext {contentVersion, scoringVersion, curriculumVersion}`. Siyosat: `compatible` / `recalculable` (xom dalil joriy model bilan qayta baholanadi) / `incompatible`. E’lon qilinmagan versiya = incompatible (fail-safe). Natijada `excludedEvidenceIds`, `recalculatedEvidenceIds`, `context`. Pack manifest’da ixtiyoriy `evidenceCompatibility` (`content-src/evidence-compatibility.json`). | `tests/p0-version-safe-mastery.test.mjs` |
| P0.6 Progress migration | Progress record format versiyasi (`PROGRESS_SCHEMA_VERSION = 2.0.0`) kontent sxema versiyasidan ajratildi. Registry: `0→1.0.0`, `1.0.0→2.0.0`. Har bir runtime yuklash: load → validate → version check → migrate → aks holda `quarantine` store’ga izolyatsiya (asl bayt saqlanadi). | `tests/p0-progress-migration.test.mjs` |
| P0.7 IndexedDB v2 | Storelar: `progress, attempts, evidence, activityState, externalEvidence, metadata` (+ `assessmentAttempts`, `mastery` kesh, `quarantine`). Evidence indekslari: `conceptId, learningUnitId, attemptId, contentVersion, createdAt`. Aniq migratsiyalar `1`, `2` (v1 evidence qayta quriladi, `appMeta → metadata`). Rad etilgan `open()` keshlanmaydi — qayta urinish mumkin. Migratsiya yiqilsa eski DB tegmagan holda qoladi, ishlash izolyatsiyalangan workspace’da davom etadi. | `tests/p0-progress-migration.test.mjs`, E2E (real Chromium v1→v2) |
| P0.8 Runtime integrity | `ContentClient` har bir pack faylining xom baytlarini SHA-256 bilan `manifest.files[path]` ga solishtiradi (hajm ham). Manifestdagi umumiy checksum fayl ro‘yxatidan qayta hisoblanadi. Ro‘yxatda yo‘q fayl, xom body o‘qib bo‘lmasligi, mos kelmaslik → `CONTENT_INTEGRITY_ERROR` (fail-closed). UI: “Kontent fayli tekshiruvdan o‘tmadi.” WebCrypto bo‘lmagan (LAN http) muhit uchun sof-JS SHA-256 fallback. Standalone build xom matnni o‘zgartirmasdan joylaydi. | `tests/p0-content-integrity.test.mjs`, E2E (buzilgan fayl → xabar) |
| P0.9 JSON Schema | Ajv 2020-12, strict. Barcha kanonik sxemalar (`concept`, `learning-unit`, `theory-activity`, `practice-activity`, `mapping-link`, `external-lab-binding`, `assessment-bank`, `content-pack-manifest`, `common`) `additionalProperties:false`. ID pattern’lar, enum’lar, nested obyektlar, dublikat ID (kolleksiya ichida va kolleksiyalar aro), referenslar. `schema:validate` sxemalarning o‘zi yopiqligini tekshiradi. | `tests/p0-schema-hardening.test.mjs` |
| P0.10 NOBOOK | `/auth` endpoint olib tashlandi (brauzer ishlatmagan). `/session`: Origin allow-list, `Content-Type`, 4 KB limit, faqat `{bindingId, learningUnitId}` qabul qilinadi; provider/modul **server** tomonidan faol pack’dagi binding’dan olinadi (binding fayli ham server tomonida checksum bilan tekshiriladi); rate limit; partner token brauzerga qaytmaydi; loglarda body/IP yo‘q. | `tests/integration/security-api.test.mjs` |
| P0.11 URL allow-list | Yagona `validateExternalLabUrl(provider, url)` (`src/integrations/external-labs/url-policy.ts`): HTTPS, credential/port yo‘q, IP literal yo‘q, provider bo‘yicha aniq host (shared hosting — faqat exact host). Build validator, runtime registry, server va CSP `frame-src` bir xil siyosatdan foydalanadi. | `tests/p0-external-labs-policy.test.mjs` |
| P0.12 External evidence | `localStorage` olib tashlandi → `IndexedDB.externalEvidence`. Maks. hajm, sxema, provider va binding/LU mosligi saqlashda **va** tiklashda tekshiriladi; buzilgan yozuv karantinga o‘tadi. | `tests/p0-external-labs-policy.test.mjs` |
| P0.13 HTTP semantika | Barcha API xatolari `{code, message, requestId}` + `X-Request-Id`. 400/403/404/405/413/422/429/500/502 va sozlanmagan funksiya uchun 503. | `tests/integration/security-api.test.mjs` |
| P0.14 Test suite | deployment surface, path traversal, API abuse, oversized payload, invalid JSON, external URL, checksum tampering, IndexedDB migration, evidence overwrite regression, version contamination — hammasi `verify` ichida. | yuqoridagi fayllar + `tests/e2e/integrity-release.spec.mjs` |

## Definition of Done

| Mezon | Holat |
|---|---|
| 0 TypeScript error | ✅ `tsc --noEmit` strict |
| 0 schema error | ✅ 941 yozuv, 0 xato |
| 0 chemistry validation error | ✅ `chemistry:validate` |
| 0 broken reference | ✅ reference validator |
| 0 unauthorized repository exposure | ✅ allow-list + testlar |
| 0 known evidence overwrite | ✅ append-only store |
| 0 cross-version mastery contamination | ✅ MasteryContext |
| 0 unauthenticated sensitive external endpoint | ✅ `/auth` yo‘q; `/session` origin + validatsiya + rate limit, sirlar serverda |
| 0 clean-machine build dependency | ✅ `npm ci && npm run verify` |

## P0 davomida topilgan va tuzatilgan baseline xatosi

`ContentClient` `window.fetch` ni bog‘lanmagan metod sifatida chaqirgan (`Illegal invocation`). Natijada
server orqali ochilgan ilovada `/learn/...`, `/curriculum`, `/labs` sahifalari “Mavzuni yuklab bo‘lmadi”
xatosini ko‘rsatgan (standalone build o‘z `fetch` o‘ramasi tufayli ishlagan). Endi `fetch` global
qabul qiluvchiga bog‘langan va bu holat real Chromium E2E testi bilan himoyalangan.

## Ongli ravishda qoldirilgan qarzlar (keyingi ishlar)

- **29 ta practice activity** to‘g‘ridan-to‘g‘ri `conceptIds` ga ega emas (konseptlar mapping orqali keladi). Bu sxema xatosi emas, pedagogik lint ogohlantirishi sifatida `reports/content-validation.json → warnings` da yuritiladi (P2.13).
- `noUncheckedIndexedAccess`: 88 ta joy; ratchet bilan kamaytiriladi.
- NOBOOK uchun hozircha hamkorga tegishli `nobook.com` domeni (va uning subdomenlari) ruxsat etilgan. Hamkor aniq experiment host’ini tasdiqlagach, `EXTERNAL_LAB_URL_POLICY.nobook` ni exact host’ga toraytirish tavsiya etiladi.
- Rate limiter bitta jarayon ichida (in-memory). Bir nechta instansiya bo‘lsa, oldiga umumiy limiter qo‘yish kerak.
- Foydalanuvchi autentifikatsiyasi yo‘q (local-first). `/session` himoyasi — origin, binding validatsiyasi, rate limit va sirlarni serverda saqlash. Cloud sync (P3) bilan birga haqiqiy auth kerak bo‘ladi.
- `lint` — arxitektura anti-pattern linteri (TT §31). Uslub linteri (ESLint) keyinroq alohida qo‘shilishi mumkin.
- `dist-rc/` P0 kodi bilan qayta yig‘ildi (`release:build`); `dist-standalone/` ham yangilandi. Ular hali ham commit qilingan artefaktlar — keyinchalik release registry’ga ko‘chirish tavsiya etiladi.

## P1–P3

Boshlanmagan. TT qoidasi bo‘yicha P1 (LearningOrchestrator, RendererRegistry, …) ushbu relizdan keyin alohida branch/milestone’da olib boriladi.

---

## P0.15 — Integrity Release closeout

P0.15 P0’ni kengaytirmaydi, yopadi. Yangi pedagogik funksiya, simulation, renderer, LearningUnit yoki assessment kontenti yo‘q.

| Band | Natija | Dalil |
|---|---|---|
| P0.15.1 Ratchet CI gate | `verify` = `scripts/p0-acceptance.ts`: lint → typecheck → **typecheck:next** → schema → content → chemistry → unit → integration → E2E → build. `noUncheckedIndexedAccess` qarzi 88; 89 bo‘lsa FAIL, kamaysa `-- --update` bilan qulflanadi. `src/` ga bitta yangi xato kiritilganda `npm run verify` → `TYPECHECK_RATCHET_REGRESSION: 89 > 88`, exit 1 (qo‘lda tekshirildi). | `tests/integration/typecheck-ratchet.test.mjs` |
| P0.15.2 Windows-safe paths | `server/paths.mjs`: `fileURLToPath(import.meta.url)` (+ `path.win32`/`path.posix`). `new URL(import.meta.url).pathname` repo kodidan olib tashlandi (7 joy) va lint qoidasi `NO_URL_PATHNAME_AS_PATH` bilan taqiqlandi. CI’da `windows-latest` job’i path testlari va real server ishga tushirishini bajaradi. | `tests/p0-server-paths.test.mjs` (`/opt/kimyolab`, `C:\KimyoLab`, `C:\Program Files\KimyoLab`, `D:\Ta'lim\KimyoLab`, Unicode, bo‘shliqli haqiqiy katalog) |
| P0.15.3 NOBOOK identity | NOBOOK hujjati bo‘yicha `unique_id` = foydalanuvchi ID’si. Qaror: Variant B + C — brauzerdagi anonim `installationId` → serverda HMAC pseudonim `kl_…`; token/sirlar server chegarasida. P0’dagi `kimyolab-${bindingId}` (barcha o‘quvchilar bitta NOBOOK foydalanuvchisi) tuzatildi. | `docs/integrations/nobook-identity-contract.md`, `tests/integration/security-api.test.mjs` |
| P0.15.4 Review surface | Kanonik taqqoslash: baseline `b173722` → P0 head. `.gitattributes` generated artefaktlarni (`public/app-preview`, `dist-rc`, `dist-standalone`, `reports`, `review-packets`, `package-lock.json`) GitHub diff’da yig‘adi. Ko‘rib chiqish tartibi: `src/` → `server/` → `scripts/` → `schemas/` → `tests/` → generated. | PR tavsifi |
| P0.15.5 Acceptance manifest | `reports/p0-acceptance.json` har `verify` da gate’larning haqiqiy exit kodlaridan generatsiya qilinadi (qo‘lda yozilmaydi, git’ga commit qilinmaydi, CI artefakti sifatida yuklanadi). `cleanBuild` = build muvaffaqiyatli **va** generatsiya qilingan `public/app-preview` + `public/content` verify boshidagi holat bilan bayt-bayt bir xil. Versiyalar: app, content (+checksum), schema, scoring, curriculum, DB, progress schema, Node, commit. | `scripts/p0-acceptance.ts` |
| P0.15.6 Release freeze | `npm run release:freeze -- --tag kimyolab-p0-integrity-20.1.0`: faqat `main` da, toza daraxtda, shu HEAD uchun `verify` PASS bo‘lsa annotated tag yaratadi; tag xabarida versiya manifesti bor. Push — alohida, ongli qadam. | `scripts/release-freeze.ts` |

### Merge’dan keyingi freeze tartibi

```
git checkout main && git pull
cd kimyolab && npm ci && npx playwright install chromium
npm run verify                                            # reports/p0-acceptance.json, commit = merge SHA
npm run release:freeze -- --tag kimyolab-p0-integrity-20.1.0
git push origin refs/tags/kimyolab-p0-integrity-20.1.0
```

### P0.15 DoD holati

| Shart | Holat |
|---|---|
| CI green | PR’da tekshiriladi |
| review complete | reviewer kutilmoqda |
| typecheck ratchet enforced | ✅ |
| Windows path resolution verified | ✅ unit (win32 semantikasi) + `windows-latest` CI job |
| NOBOOK identity semantics documented | ✅ |
| P0 diff review qilingan | reviewer kutilmoqda |
| merge complete | kutilmoqda |
| Integrity Release tag | merge’dan keyin `release:freeze` |

### Merge oldidan yakuniy kill-critic review (b173722 → P0.15 HEAD)

Topilgan va tuzatilgan blocker’lar (har biri uchun tuzatishsiz yiqiladigan test qo‘shildi):

1. **Migratsiyadan keyin mastery yo‘qolishi.** v1 dalillarida `curriculumVersion` yo‘q; brauzer mastery’ni
   `curriculumVersion` bilan hisoblagani uchun eski o‘quvchilarning dalillari (aynan shu content versiyasidan)
   jim chiqarib tashlanar edi. Endi dalil xuddi shu `contentVersion` dan bo‘lsa, curriculum versiyasini meros
   oladi (pack bitta curriculum versiyasini belgilaydi). Boshqa pack’dagi dalillar avvalgidek chiqariladi.
2. **Release freeze oqimi buzuq va bypass qilinadigan edi.** `verify` kanonik `content-src/migration-report.json`
   ni (faqat vaqt tamg‘asini) o‘zgartirgani uchun `verify → release:freeze` “tree dirty” bilan yiqilardi; freeze
   esa git’da kuzatilmaydigan, qo‘lda tahrirlanadigan report fayliga ishonardi va `--allow-any-branch` bor edi.
   Endi: migration report deterministik; acceptance `workingTreeCleanAtStart` ni qayd etadi; freeze faqat
   `main` da, toza daraxtda acceptance’ni **o‘zi qayta ishga tushiradi**, verify manba fayllarni o‘zgartirmaganini
   tekshiradi, bypass flag’lari yo‘q (`tests/integration/release-freeze.test.mjs`, soxta PASS report bilan ham).
3. **Vakuum test.** “Faqat faol/oldingi pack public” testi mavjud bo‘lmagan versiyani so‘ragani uchun har doim
   o‘tardi. Endi `dist` ichiga pointer’da yo‘q pack qo‘yiladi va 404 kutiladi; `previousVersion` 200.
