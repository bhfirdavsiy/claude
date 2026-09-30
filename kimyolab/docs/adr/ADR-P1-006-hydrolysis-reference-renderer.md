# ADR-P1-006 — Hydrolysis reference renderer (`hydrolysis-medium@1.0.0`)

- **Holat:** qabul qilindi (P1.5 implementatsiyasi). Bu human assessment approval, chemistry approval yoki pilot sign-off **emas**.
- **Kontekst:**
  - ADR-P1-005 (RendererRegistry, atom-builder).
  - P1.3/P1.4 hisobotlaridagi `hydrolysis-medium: CANNOT_SUCCEED`.
- **Asosiy qoida:** renderer mavjud domain modelni ochib beradi, yangi kimyo ixtiro qilmaydi. Renderer mavjudligi activity’ni release ham, approve ham qilmaydi.

## 1. Muammo (9.14 bug)

`practice.experiment.9.14` legacy formasi uchta tugma (`selectSalt`, `addIndicator`, `recordMedium`) yuborardi, lekin **payload’siz**:
- adapter tuzni ham, muhitni ham ko‘rmasdi;
- o‘quvchi hech qachon muvaffaqiyatga erisha olmasdi.

Bundan tashqari `recordMedium` indikatordan **keyin** kelardi. Bu bashorat emas, ochilgan javobni ko‘chirish edi.

Regression test birinchi yozildi va alohida commit qilindi: `tests/p1-5-hydrolysis-regression.test.mjs`. U `fc216f9` da FAIL, P1.5 dan keyin PASS.

## 2. Domain authority

| Qatlam | Fayl | Vazifa |
|---|---|---|
| Content | `content-src/chemistry/hydrolysis.json` | 4 tuz → muhit; **indikator bloki** (lakmus: kislotali → qizil, ishqoriy → ko‘k, neytral → binafsha). Hammasi `reviewStatus: pending`, CHEM-033 review surface’ida. |
| Domain model | `src/domain/chemistry/hydrolysis-model.ts` | `classify(salt)`, `salts()` (content tartibida), `indicatorColor(medium)`. Indikator yo‘q → `HYDROLYSIS_INDICATOR_NOT_MODELED`, rang o‘ylab topilmaydi. |
| Trial qoidalari | `src/domain/chemistry/hydrolysis-trial.ts` | `selectSalt → predictMedium → addIndicator` ketma-ketligi. Predict-before-reveal, rad etish kodlari, `achieved`. |
| Engine natijasi | `src/runtime/reference-slices/hydrolysis-practice.ts` | Trial → evidence. Beta2 experiment (9.14) va beta3 simulation (11.11) **bir xil** baholanadi. |

**Indikator haqida.** Oqimning “indikator qo‘shish” qadami foydalanuvchi talabida bor. Lakmus ranglari maktab darajasidagi kuzatuv va kodga emas, content’ga yozildi. Chemistry reviewer ularni tuzlar bilan birga ko‘radi. Ular **tasdiqlanmagan**.

## 3. Trial qoidalari (domain’da, UI’da emas)

- **Credit:** faqat indikatordan **oldin** qilingan to‘g‘ri bashorat (`predictedBeforeReveal: true`) ball oladi.
- **Kech bashorat:** indikatordan keyingi bashorat trial sifatida yoziladi, `score: 0`. Evidence validatori `score > 0 && !predictedBeforeReveal` ni rad etadi.
- **Noto‘g‘ri bashorat:** evidence bo‘ladi (`selectedSalt`, `predictedMedium`, `actualMedium`, `correct`). `correct` domain qiymati bilan tekshiriladi, validator mos kelmaslikni rad etadi.
- **Bashorat qulflanadi:** trial yozilgach bashorat o‘zgarmaydi (`HYDROLYSIS_PREDICTION_LOCKED`). Tuzni qayta tanlash yangi trial ochadi.
- **Fail-closed:** modellashtirilmagan tuz → `HYDROLYSIS_NOT_MODELED`: amal hech narsani o‘zgartirmaydi, kuzatuv yo‘q. Legacy `recordMedium` ham rad etiladi.
- **Tugallanish:** target tuz (config) + oldindan to‘g‘ri bashorat. Config’dagi `expectedMedium` domain’ga zid bo‘lsa → `HYDROLYSIS_CONFIG_MISMATCH`. Boshqa tuzlar tadqiqot uchun: evidence yoziladi, lekin vazifani yakunlamaydi.
- **Retry:** host “Qaytadan urinish (yangi urinish)” tugmasi → `port.retry` → yangi attempt. Eski attempt va evidence o‘zgarmaydi.

## 4. RendererModel va intent’lar

- **`HydrolysisRendererModel`** (`kimyolab.renderer.hydrolysis-medium.v1`) faqat `toHydrolysisRendererModel(result)` orqali olinadi.
  - Kirish: `finalState.hydrolysis` (domain holati) va engine evidence.
  - Converter faqat matnga aylantiradi. Tuzlar ro‘yxati, muhit, rang, to‘g‘ri/noto‘g‘ri va maqsad domain yoki evidence’dan keladi.
- **Intent’lar** mavjud command contract’ida:
  - `{type:'selectSalt', payload:{salt}}` — saltId, yorliq emas;
  - `{type:'predictMedium', payload:{medium: 'acidic'|'basic'|'neutral'}}`;
  - `{type:'addIndicator'}`.
  - 9.14 sahifasida `experiment-action`, 11.11 sahifasida `simulation-action`. Renderer turni mount context’dagi `practiceType` dan oladi.
- **Registratsiya:** `src/renderers/catalog.ts` (`HYDROLYSIS_MEDIUM_CAPABILITY`) va `src/renderers/index.ts`.
  - Registry yadrosi (`registry.ts`) **o‘zgarmadi**.
  - `contract.ts` ga faqat ixtiyoriy `RendererMountContext.practiceType` qo‘shildi. Sabab: bitta capability ikki engine oilasiga xizmat qiladi, host esa e’lon qilinmagan intent turini baribir rad etadi.

## 5. Content va readiness

- `rendererRequirement {capability:'hydrolysis-medium', range:'^1.0.0'}` qo‘shildi:
  - `beta2-advanced.json` → 9.14;
  - `beta3-advanced.json` → 11.11.
- Readiness sonlari o‘zgarmadi: 118 READY / 27 PENDING / 1 DISABLED.
  - 9.14 va 11.11 avvaldan runtime READY (observe) va content `REVIEW_PENDING` edi va shunday qoladi.
  - Hech narsa release qilinmadi va hech narsa approve qilinmadi.
- Legacy UI modeli `rendererRequirement` bor har activity uchun `RENDERER_REQUIRED` tashlaydi. Hydrolysis’ning payload’siz tugmalari olib tashlandi.
- Migratsiya (hisobotdan hisoblanadi): 146 activity:

  | Yo‘l | Soni |
  |---|---|
  | Registry | 3 |
  | Legacy | 142 |
  | Blocked | 0 |
  | Unrouted | 1 |

## 6. Accessibility

- **Klaviatura:** native radio guruhlari (`fieldset` + `legend`: “1. Tuzni tanlang”, “2. Muhitni oldindan ayting”) va tugma (“3. Indikator qo‘shish”). Tab, bo‘sh joy, strelkalar va Enter bilan ishlaydi.
- **Yorliqlar:** lokalizatsiya qilingan (Kislotali / Ishqoriy / Neytral). Tuzlar formula ko‘rinishida (AlCl₃); raw ID ko‘rsatilmaydi.
- **Kuzatuv matni:** “Indikator (lakmus) qizil tusga o‘tdi. Muhit kislotali.” Natija ✓/✗ matni bilan beriladi, hech qachon faqat rang bilan emas.
- **Screen reader:** `aria-live="polite"` xulosa va text-state jadval.
- **Harakat:** animatsiya yo‘q (`reducedMotion: 'static'`).
- **Predict-before-reveal UI’da ham:** indikator tugmasi bashoratgacha o‘chirilgan. Trial yozilgach bashorat radiolari o‘chiriladi.

## 7. Guard’lar

- Yangi qoida `RENDERER_IMPORTS_CONTENT_DATA`: renderer quyidagilarni qila olmaydi:
  - `.json`, `content-src/`, `activity-configs`, `public/content/` yoki `content-client.ts` ni import qilish;
  - `fetch`/`require`/dinamik `import` chaqirish;
  - content yo‘li literal’ini (template literal ham) ishlatish.
- Mavjud renderer guard’lari hydrolysis paketiga ham qo‘llanadi. Real paketlarda 0 violation.

## Scope’dan tashqari

- Ionic precipitation (P1.6), elektroliz.
- WebGL / 3D, to‘liq periodik jadval renderer’i.
- Global readiness.
- Assessment auto-approval, D9, server-side assessment.
