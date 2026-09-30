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

## Addendum — P1.4 closeout (merge oldidan audit blockerlar)

### A1. Kimyoviy identifikatsiya va lokalizatsiya qilingan matn ajratildi

- `src/domain/chemistry/periodic-table.ts` endi faqat **Z + IUPAC belgi** saqlaydi. `nameUz` va `NAMES_UZ` olib tashlandi.
- O‘zbekcha element nomlari content: `content-src/locales/uz-latn/chemistry-elements.json`.
  - `reviewStatus: pending`.
  - Pack’ga `locales/uz-latn/…` sifatida ko‘chiriladi. Pack yo‘llari manifest qoidasi bo‘yicha kichik harfda; BCP 47 teg `uz-Latn` faylning ichida saqlanadi.
  - Build vaqtida validatsiya qilinadi: har kalit haqiqiy element belgisi, har qiymat bo‘sh bo‘lmagan matn. Aks holda build yiqiladi.
- Yangi parallel i18n tizimi yaratilmadi. Mavjud arxitektura kengaytirildi:
  - pack fayli;
  - `ContentClient.loadPractice` uni yuklaydi va `page.localization.elementNames` ga qo‘yadi (noto‘g‘ri fayl → `LOCALIZATION_INVALID`, fail-closed);
  - host uni yagona tasdiqlangan presentation mapper (`src/features/localization/element-names.ts#elementNameMapper`) orqali renderer mount context’iga beradi.
- Nomlar **CHEM-033 review surface**’iga kiradi (`chemistryReviewSurface` → `content-src/locales/**`), shuning uchun `expertReviewHash` ularni qamraydi. Hash o‘zgardi, lekin chemistry approval baribir `pending` edi: hech narsa bekor bo‘lmadi, hech narsa tasdiqlanmadi.

**Nega 118 ta belgi kodda qoladi?**
- Belgi — kimyoviy identifikatsiya: IUPAC tomonidan qat’iy belgilangan, tilga bog‘liq emas.
- Formula parser, atom modeli va evidence belgilarga tayanadi. Ularni content’ga ko‘chirish domain haqiqatini tahrirlanadigan faylga bog‘lardi va har pack build’ida domain xulqi o‘zgarishi mumkin bo‘lardi.
- Nom esa tilga bog‘liq, review qilinadigan matn. Shuning uchun u content’da.

### A2. `AtomRendererModel` domain’dan nom olmaydi

- `AtomState.elementName` olib tashlandi.
- Converter `toAtomRendererModel(result, elementName?)` belgini domain’dan, nomni mapper’dan oladi. Mapper bo‘lmasa belgining o‘zi ko‘rsatiladi.
- Formula parser faqat `ELEMENT_SYMBOL_SET` ga tayanadi. Regression test: nomi bo‘lmagan element (`Fe`, `Og`) ham parse qilinadi, lokal nom esa formula emas.

### A3. Z = 0 — aniq oraliq holat

- `AtomState.construction: 'noElementYet' | 'element'`.
- Matn: “Element hali tanlanmagan: yadroga proton qo‘shing.” Avvalgi “element aniqlanmagan” iborasi noma’lum element degan taassurot berardi.

### A4. Version range: hujjatlangan kichik subset, npm-semver emas

- Versiya qat’iy `MAJOR.MINOR.PATCH`: boshida nol yo‘q, pre-release va build metadata yo‘q.
- Range shakllari: `*`, aniq versiya, `^X.Y.Z` (X ≥ 1), yoki 1–2 ta comparator bitta probel bilan.
- Qo‘llab-quvvatlanmaydi va rad etiladi (fail-closed):
  - `^0.x` (npm semantikasi boshqacha, taxmin qilinmaydi);
  - `||`, `~`, `x`;
  - qisman versiya (`>=1 <2`);
  - hyphen range;
  - atrofdagi yoki ketma-ket probel.
- `isVersionRange` va `satisfiesVersionRange` bitta parser’dan foydalanadi.
- Bir nechta mos versiya bo‘lsa, eng kattasi raqamli taqqoslash bilan tanlanadi (`1.10.0 > 1.9.0`).

### A5. Build ⇔ runtime parity

- Property test ~3 000 talab (seed’li generator + qo‘lda yozilgan holatlar) uchun “build mos deydi ⇔ runtime `resolve` muvaffaqiyatli” tengligini tekshiradi.
- To‘liq `compileReadiness` bilan ham tekshiriladi: READY ⇔ resolve.

### A6. Host error boundary

- Har chizishni host boshqaradi: har engine natijasidan keyin `instance.update`.
- Renderer mount paytida yoki keyin exception tashlasa:
  - stage lokalizatsiya qilingan alert bilan almashtiriladi;
  - keyingi intent’lar rad etiladi (`RENDERER_FAILED`);
  - legacy renderer’ga fallback yo‘q.
- Attempt va evidence’ga tegilmaydi: orchestrator yozgan narsa (maqsadga yetgan evidence ham) saqlanib qoladi. Hech narsa rollback qilinmaydi va qo‘shilmaydi.
