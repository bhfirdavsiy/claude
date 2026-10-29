# TT 4.1 — Freeze, audit va ishlab chiqarishga dastlabki qaror

- **Asos:** «KimyoLab — Yagona Texnik Topshiriq» (2026-10-29), bo‘lim 4.1.
- **Audit qilingan commit:** `a6abd47c252df5067f1ad209056de66f2162c811` (PR #30 head). Yuklangan arxiv shu commit bilan baytma-bayt solishtirildi: 1960/1960 fayl, farq 0 ta.
- **Main:** `5875411241013f842767b44af7049e33ca3fb863` normal merge commit bilan qo‘shildi. To‘qnashuv bo‘lmadi; o‘zgarishlar faqat repo ildizida (14 ta rasm, `kimyolab/`dan tashqarida).
- **Freeze manifest:** `reports/freeze-manifest.json` (`npm run freeze:manifest -- --check`). Commit SHA PR’da va yakuniy hisobotda qayd etiladi, chunki fayl o‘zini o‘z ichiga olgan commit’ning SHA’sini saqlay olmaydi.
- **Holat:** **DRAFT.** Bu audit chiqarish ham, pilot qarori ham emas. Mustaqil (inson) review va integratsiya tasdig‘i hali yo‘q.

## 1. Condition semantikasi — mustaqil qayta ko‘rib chiqish (4.1.2)

| Joy | Topilgan holat | Natija |
|---|---|---|
| `requirementsMet` (`require-record-conditions`) | P2.14 closeout’da tuzatilgan: qat’iy boolean’lar, noma’lum kalit bajarilmaydi | qayta tekshirildi, regressiyalar (closeout 1–12) yashil |
| `conditionMatch` (`filter-by-query`) | boolean’lar qat’iy edi, **lekin** so‘rovdagi `catalystIds`, `temperatureRange`, `pressureRange`, `concentrationRules`, `dimensions` **e’tiborsiz qoldirilardi**; noma’lum kalit ham jim o‘tkazilardi | **tuzatildi:** so‘rovdagi har maydon nomzodlarni toraytiradi; `dimensions` lug‘at orqali solishtiriladi (lug‘at bo‘lmasa — mos kelmaydi); noma’lum kalit `REACTION_QUERY_CONDITION_UNKNOWN` xatosini beradi. Yagona production caller (`experiment-adapter.ts`) shartsiz chaqiradi — xatti-harakat o‘zgarmadi (test bilan isbotlangan) |
| explorer-support contract | `EXPLORER_CONDITION_UNSUPPORTED`, deep link / search / reachability yo‘q | qayta tekshirildi |
| hash invalidation | condition assertion yozuv talab qilgan barcha maydonni hash qiladi; tahrir → `stale` | qayta tekshirildi (closeout 11) |

TT 27463 regressiyalari avtomatik testlar bilan yopilgan. Lekin «mustaqil dalil» (4.1.2) — bu inson review’i; u ochiq qoladi (§5).

## 2. Majburiy tekshiruvlar (4.1.3)

| Tekshiruv | Natija |
|---|---|
| `npm ci` | PASS (vite 8.3.5 bilan) |
| lint, typecheck, typecheck:next, schema, content, chemistry | PASS |
| `npm test` | 869/869, **0 skip** |
| integration | 96/96, 0 skip |
| E2E (Playwright, 132 ta, accessibility sweep 140 / 5 / 0 / 1 bilan) | 132/132 |
| build va P0 suite’lar (content integrity, evidence, migration, server paths) | PASS |
| `lab:inventory`, `studio:report`, `periodic:report`, `knowledge:report` `--check` | PASS |
| deploy:build, preflight 17/17, smoke 23/23, rollback drill, clean drill, readiness 24/24 | PASS |

**Jim skip yo‘q.** Ikkita holat ochiq qayd etiladi:
- **E2E lokalda `--trace off` bilan ishga tushirildi.** Konteyner diski to‘la (`ENOSPC` trace yozishda); testlar va tekshiruvlar aynan bir xil. To‘liq `npm run verify` (trace bilan) CI’da ishlaydi.
- **`standalone:smoke` bir marta `CHROMIUM_CDP_TIMEOUT` bilan to‘xtadi.** Qayta ishga tushirilganda PASS bo‘ldi. Bu ham yozib qo‘yildi; «flake» deb yashirilmadi.

`deploy:readiness` natijasi `READY_IN_SIMULATION` — TT §5 bo‘yicha bu **PASS emas**. Haqiqiy portal sinovi (4.9) hali yo‘q.

CI run ID’lari (immutable) PR’da va yakuniy hisobotda yoziladi.

## 3. Assetlar, config va xavfsizlik (4.1.4)

| Mavzu | Topilgan holat | Qaror |
|---|---|---|
| sirlar | tracked fayllarda kalit, token yoki private key namunasi topilmadi; `.env` yoki `*.pem` yo‘q | OK |
| source map | faqat legacy `vendor/bootstrap/*.map` (V19). Deploy artefaktida `.map` 0 ta, `vendor/` yo‘q | OK |
| production CSP | `server/app.mjs`: `default-src 'self'`, `script-src 'self'`, `nosniff`, `no-referrer`; `docs/DEPLOY.md` nginx namunasi bilan mos | OK, haqiqiy hostingda tasdiqlash kerak (4.9) |
| feature flag’lar | `guidedDynamicLabV1`, `contentStudioV1`, `periodicTableV1`, `substancePassportV1`, `reactionExplorerV1` — hammasi `default:false` | OK |
| dependency audit | runtime bog‘liqlik 0 ta. Dev: vite 8.3.1 (high, 6 advisory), source-map-js 1.2.1 (high), fast-uri 3.1.8 (moderate) | **tuzatildi:** vite 8.3.5, source-map-js 1.2.2, fast-uri 3.1.9 (major emas); `npm audit` → **0** |
| release manifest | `dist-rc/release-manifest.json`, `reports/deployment-artifacts.json` deterministik (timestamp’siz) | OK |
| **mualliflik huquqi** | deploy artefaktidagi 3 ta rasm (`assets/home/*.png`) uchun manba yoki litsenziya yozuvi **yo‘q**. `content-src/licenses.json`dagi legacy bundle’lar (`css/`, `js/`, `images/`, `fonts/`, `vendor/`, `inc/`) `license: unknown`, `status: pending`. Main’ga yuklangan darslik muqovalari (`public/textbooks/*.png`) uchinchi tomon nashrlari | **inson qarori (P1):** litsenziya o‘ylab topilmaydi. Huquq egasi yoki litsenziya aniqlanmaguncha public release taqiqlanadi (4.6) |

## 4. Freeze manifest (4.1.5)

`reports/freeze-manifest.json` quyidagilarning SHA-256 qiymatini saqlaydi:
- toolchain: `.nvmrc`, `package.json`, `package-lock.json`;
- source daraxtlari: `src`, `scripts`, `server`, `content-src`, `tests`;
- commit qilingan generated kontent: `public/content`, `public/app-preview`;
- content pack (`contentVersion`, checksum);
- config: deploy config, env example, typecheck ratchet, feature flag default’lari;
- har bir `reports/*.json`.

`--check` ish daraxti manifestga teng ekanini isbotlaydi. Uni **toza checkout**da ishga tushirish kerak: `npm test` ba’zi reportlarga (`activity-routing`, `beta*-readiness` va boshqalar) faqat yangi vaqt belgisini yozadi, shuning uchun test ishlagandan keyingi daraxt manifestdan farq qiladi. Bu bilan kirish ma’lumoti o‘zgarmaydi.

## 5. 4.1 qabul mezonlari — holat

| Mezon | Holat |
|---|---|
| independent review | **OCHIQ** — inson reviewer kerak (agent o‘z ishini mustaqil tasdiqlay olmaydi) |
| SHA freeze | tayyor (freeze manifest + commit SHA) |
| barcha majburiy tekshiruvlar PASS | lokal PASS; CI natijasi PR’da |
| 0 ochiq P1 blocker | **OCHIQ** — mualliflik huquqi (§3) |
| tasdiqlangan integratsiya | **OCHIQ** — haqiqiy portal sinovi yo‘q (4.9) |

Shuning uchun qaror **DRAFT**: PR #30 merge qilinmaydi.

## 6. Topshiriqlar kartotekasi (TT §6) — ochiq ishlar

| ID | Modul | Tavsif | Mas’ul | Bog‘liqlik | Holat |
|---|---|---|---|---|---|
| T-4.1-01 | 4.1 | PR #30 bo‘yicha mustaqil kod review | texnik/release mas’uli | — | ochiq |
| T-4.1-02 | 4.1/4.6 | `assets/home/*.png` va legacy bundle’lar uchun huquq/litsenziya qarori | huquq egasi + texnik mas’ul | — | **P1 blocker** |
| T-4.2-01 | 4.2 | `rxn.agno3-nacl`: NaCl(aq) species qo‘shish yoki yozuvni tuzatish | kimyo eksperti | — | ochiq |
| T-4.2-02 | 4.2 | 28 reaksiya + 6 flag’langan kuzatuvning individual review’i (decision register) | kimyo eksperti | T-4.2-03 | ochiq (0/28) |
| T-4.2-03 | 4.2 | atom massalari va xossalar uchun registry’ga qabul qilingan manbalar (HUMAN_ACCEPTED) | kimyo eksperti | — | ochiq (5 manba, hammasi PROPOSED) |
| T-4.2-04 | 4.2 | 39 xavf da’vosi va qolgan species uchun safety review | kimyogar + metodist | T-4.2-03 | ochiq |
| T-4.2-05 | 4.2 | explicit no-reaction yozuvlari (faqat authored + reviewed) | kimyo eksperti | T-4.2-03 | ochiq (0) |
| T-4.3-01 | 4.3 | 122/122 unit uchun strukturali nazariya (avtomatik generatsiya qilingan matn approved sanalmaydi) | metodist + muallif | T-4.6-01 | ochiq (0/122) |
| T-4.4-01 | 4.4 | har bir rejalashtirilgan laboratoriya uchun model contract, fixture, pedagog review, a11y sign-off | metodist + texnik | T-4.2-02 | ochiq |
| T-4.5-01 | 4.5 | har unitga kamida 1 inson tasdiqlagan assessment; mavjud 5 item review | metodist | T-4.3-01 | ochiq (0/122) |
| T-4.6-01 | 4.6 | Content Studio workflow (DRAFT → REVIEW_PENDING → APPROVED → RELEASED), audit trail | texnik | — | qisman (P2.12) |
| T-4.7-01 | 4.7 | uz-Kirill va ru lokallari, terminlar lug‘ati; NVDA/VoiceOver bilan qo‘lda a11y sinovi | tarjimon + a11y mutaxassis | T-4.3-01 | ochiq |
| T-4.8-01 | 4.8 | rolga mos task testlari, video/screenshot dalillari | UX + o‘qituvchi | — | ochiq |
| T-4.9-01 | 4.9 | `raqamlitalim.trm.uz` ostida haqiqiy deploy va smoke; imzolangan artefakt; staging → pilot → production | texnik/infra | T-4.1-02 | ochiq (faqat simulyatsiya) |
| T-4.10-01 | 4.10 | maktab pilot protokoli, oldindan tasdiqlangan metrikalar, 3 ta mustaqil imzo | komissiya | barchasi | ochiq |

Bu jadvaldagi hech bir ishni agent yopilgan deb belgilamaydi. Har birini yopish uchun mas’ulning hujjatlashtirilgan qarori kerak (TT §7).
