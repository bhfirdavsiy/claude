# ADR-P1-005 — RendererRegistry va atom-builder reference renderer

- **Holat:** Qabul qilingan (P1.4).
- **Asos:** `docs/plans/p1.4-renderer-foundation-contract.md` (P1.4 implementatsiyasi uchun tasdiqlangan), ADR-P1-004 §5–§6.
- **Bu qaror emas:** assessment approval, pilot sign-off, global readiness enforcement. Human review oqimi `PENDING` qoladi.
- **Hisobotlar** (deterministik, `content:validate` → `verify` ichida):
  - `reports/renderer-registry.json`
  - `reports/renderer-migration.json`
  - `reports/reference-renderer-atom.json`

## 1. Capability + version registry

- `src/renderers/contract.ts`: `RendererCapability` quyidagilardan iborat:
  - `id`;
  - `version`;
  - `rendererModelSchema`;
  - `intents` — mavjud `PracticeCommand` turlari;
  - `accessibility`.
- `src/renderers/registry.ts`: `RendererRegistry.register()` va `resolve(requirement)`. Kalit `capability id + semver range`.
  - Bir nechta mos versiya bo‘lsa, eng yuqorisi olinadi.
  - Bir xil `id@version` ikkinchi marta ro‘yxatdan o‘tsa → `RENDERER_DUPLICATE`. First-match-wins yo‘q.
- **`activityId` hech qachon kalit emas.** Guard `RENDERER_SELECTED_BY_ACTIVITY_ID` presentation va `src/renderers/**` ichida uni taqiqlaydi.
- **Versiya mosligi:** `src/runtime/compatibility/version-range.ts` (exact, `^x.y.z`, `>=a <b`, `*`).
  - U mavjud `compareVersion`ni qayta ishlatadi (content-pack compatibility). Yangi dependency yo‘q.
  - Tushunarsiz range yoki versiya hech qachon mos kelmaydi.
- `src/renderers/catalog.ts` — DOM’siz deklaratsiyalar (build va hisobotlar uchun).
  - Implementatsiya o‘z deklaratsiyasini katalogdan oladi, shuning uchun ikkalasi ajralib keta olmaydi (test bor).

## 2. RendererModel boundary

```
Chemistry Domain → Engine/Adapter → RendererModel → Renderer → Intent → ReferencePracticeSession → Domain
```

- Renderer faqat `RendererModel`ni chizadi va `RendererHost.dispatch(intent)` orqali intent yuboradi. Host sessiya va orkestratorni chaqiradi.
- **Renderer qilmaydi:**
  - kimyo hisobi;
  - progress, attempt yoki evidence yozish;
  - mastery, readiness yoki assessment baholash.
- **Guard’lar (AST):**

  | Rule | Nimani taqiqlaydi |
  |---|---|
  | `RENDERER_IMPORTS_PERSISTENCE` | progress, orchestrator, evidence modullari |
  | `RENDERER_IMPORTS_MASTERY` | `domain/mastery` |
  | `RENDERER_DERIVES_READINESS` | readiness, assessment, pilot, governance |
  | `CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER` | `domain/chemistry`, engine’lar, runtime adapterlari |
  | `CHEMISTRY_COMPUTED_IN_RENDERER` | proton/neytron/elektron ustida `+`/`−`; `atomicNumber`/`massNumber`/`charge` qiymatini qayta hisoblash; ≥3 element belgili jadval |

  - Type-only import’lar ruxsat etilgan.
  - Display matn (“Protonlar”) ruxsat etilgan (false-positive testlari bor).

## 3. Kimyoviy haqiqat faqat domain’da

- `src/domain/chemistry/periodic-table.ts` — **yagona** Z → element manbai (118 belgi, Z≤20 uchun o‘zbekcha nom).
  - Formula parser’dagi element ro‘yxati shu yerga ko‘chirildi. Parser endi shu manbadan o‘qiydi.
  - Atom adapteridagi `ELEMENTS` jadvali olib tashlandi.
- `src/domain/chemistry/atom.ts` — `AtomState` va `deriveAtomState` / `applyParticleDelta`:

  | Maydon | Hisob |
  |---|---|
  | `atomicNumber` | = protonlar |
  | `massNumber` | = protonlar + neytronlar |
  | `charge` | = protonlar − elektronlar |
  | `element`, `elementName`, `isotope` | davriy jadvaldan |

- **Fail-closed:**
  - manfiy yoki butun bo‘lmagan zarracha soni → `ATOM_PARTICLES_INVALID`;
  - Z>118 → `ATOM_ATOMIC_NUMBER_UNSUPPORTED`;
  - Z=0 — element va izotop `null` (avvalgi soxta “Z0” yo‘q).
- Reducer avvalgi clamping xulqini saqlaydi (0 dan past va chegaradan yuqoriga o‘tmaydi), shu bilan learning semantics o‘zgarmaydi.

## 4. Fail-closed renderer resolution va readiness

- **Build:** execution compiler content config’dagi `rendererRequirement {capability, range}`ni `ActivityExecutionPlan`ga ko‘chiradi. Faqat talab qiladigan activity’larda; hozir bittasi: `practice.simulation.7.07.planned`. Noto‘g‘ri shakl → `CONFIG_INVALID` (build FAIL).
- **Readiness:** `compileReadiness` talabni katalog bo‘yicha tekshiradi (runtime bilan bir xil `selectCapability` qoidasi). Mos renderer yo‘q → `runtime = BLOCKED`, reason `RENDERER_UNAVAILABLE`, o‘quvchiga lokalizatsiya qilingan matn chiqadi.
- **Runtime:** `renderPracticePage` (`src/features/practice/host.ts`) `registry.resolve(requirement)` qiladi.
  - Topilmasa → matnli xabar.
  - Raw kod ko‘rsatilmaydi, generic formaga jim fallback yo‘q.

## 5. Strangler migration

- `rendererRequirement` bor → RendererRegistry.
- Aks holda → eski `renderPractice`, o‘zgarishsiz.
- **Natija:** 146 activity → 1 registry, 144 legacy, 0 blocked, 1 unrouted (disabled). 117 ta boshqa launch qilinadigan activity eski UI model’ini quradi (test bor).
- Atom endi generic `simulation` shaklidan chiqarildi. Legacy UI model atom uchun `RENDERER_REQUIRED` tashlaydi. Eski UI’dagi `element-(p+n)` maqsad yorlig‘i hisobi olib tashlandi.

## 6. Accessibility — registratsiya sharti

Har capability quyidagilarni e’lon qiladi; bittasi yo‘q bo‘lsa → `RENDERER_ACCESSIBILITY_INCOMPLETE`:
- `keyboard`;
- `nonColorCues`;
- `screenReaderSummary`;
- `reducedMotion` (`static`/`reduced`);
- `nonVisualAlternative`.

atom-builder e’lonlari **real**, E2E bilan tekshirilgan:
- faqat klaviatura bilan bajariladi (Tab + Enter, sichqoncha yo‘q);
- `aria-live` xulosa: “Uglerod-14. Neytral atom. 6 proton. 8 neytron. 6 elektron.”;
- zaryad va maqsad matn + shakl (○ ⊕ ⊖ ✓) bilan beriladi, hech qachon faqat rang bilan emas;
- animatsiya umuman yo‘q (`getAnimations()=0`, transition 0);
- to‘liq holat jadvali (text-state).

## 7. atom-builder reference implementatsiyasi

- **`AtomRendererModel`** (`kimyolab.renderer.atom-state.v1`, JSON-serializable) yagona converter `toAtomRendererModel(result)` orqali hosil bo‘ladi.
  - Converter adapter natijasidagi `finalState` va `goal` (domain `AtomState`) hamda engine evidence’ini formatlaydi, kimyo hisoblamaydi.
  - `goalReached` engine’ning construction evidence’idan olinadi, UI’da sanoqlarni solishtirish yo‘q.
- **Intent:** mavjud `simulation-action {particle, delta:±1}`. Tez bosishlar navbatga qo‘yiladi, tashlab ketilmaydi.
- **Evidence parity:** eski kod (main `f45659e`) bilan yozilgan baseline (`tests/fixtures/atom-legacy-baseline.json`) bilan quyidagilar aynan teng (unit + brauzer E2E):
  - evidence, score, finalState;
  - attempt holati, progress;
  - `PRACTICE_COMPLETED` qadami.
- **Completion:** “Mustahkamlashga o‘tish” faqat `isPracticeResultComplete(engine natijasi)` bo‘lganda chiqadi. Tugma bosilgani uchun emas.
- **Black-swan:** turli p/n/e turli domain holati va turli RendererModel beradi (C-14 neytral, Na-23 +1, O-16 −2). Bu canned animatsiya emas.

## Scope’dan tashqari (qasddan)

- **ionic-precipitation:** kelajak dependency — `reagent-choice` intent. Hozirgi oqim “model-capable but not yet model-exposed”.
- **hydrolysis:** UI yo‘li hanuz `CANNOT_SUCCEED`, hisobotlarda ochiq ko‘rinadi.
- **electrolysis:** 1 yozuvli model, renderer yozish canned animatsiya bo‘lardi.
- **Boshqalar:** WebGL/Canvas/3D, D9, assessment kengaytirish, server-side evaluation, global readiness.
