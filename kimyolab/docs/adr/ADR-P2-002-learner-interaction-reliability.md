# ADR-P2-002 — Learner interaction reliability va usability

- **Holat:** qabul qilindi (P2.1).
- **Scope:** mavjud legacy practice UI’ning ishonchliligi va o‘qiluvchanligi.
- **Qilinmadi:**
  - yangi renderer, assessment itemi, nazariya yoki kimyo haqiqati;
  - release/approval qarori; global strict yoqilmadi;
  - to‘liq uz-Cyrl yoki ru tarjima.

## 1. Learner input hech qachon session’ni yiqitmaydi (9.23)

**Root cause.** `practice.simulation.9.23.planned` (marganes redoks, muhit) free-text maydon edi. Runtime (`src/runtime/beta2/advanced.ts`) o‘quvchi yozgan qiymatni to‘g‘ridan-to‘g‘ri `ManganeseRedoxModel.resolve(medium)`ga berardi. Model faqat `acidic | neutral | basic`ni biladi, qolganida `MANGANESE_MEDIUM_NOT_MODELED` exception tashlaydi. Shuning uchun “kislotali”, bo‘sh qator yoki xato yozuv session’ni yiqitardi; UI “Amalni bajarib bo‘lmadi” deb ko‘rsatardi.

**Tuzatish (runtime qatlamida, UI’da yashirilmagan).**
- Runtime avval `manganeseModel.media()` bilan tekshiradi. Noma’lum qiymat mavjud outcome shakliga tushadi: `{status:'invalid', code:'LEARNER_INPUT_INVALID'}`. Bunda dalil yo‘q va exception ham yo‘q.
- Model domen haqiqati bo‘lib qoladi: `resolve()` hamon throw qiladi, bu tizim invarianti.
- Regression testi (`tests/p2-1-learner-interaction.test.mjs`) eski kodda FAIL bo‘lgani tekshirildi: `MANGANESE_MEDIUM_NOT_MODELED`.

**Taksonomiya (parallel taksonomiya emas).** `src/runtime/shared/learner-input.ts` mavjud shakllarga nom beradi:

| Kategoriya | Mavjud shakl |
|---|---|
| `LEARNER_INCORRECT` | `score 0` / `achieved false` bo‘lgan dalil |
| `LEARNER_INPUT_INVALID` | `invalid` outcome |
| `MODEL_NOT_SUPPORTED` | mavjud `*_NOT_MODELED` kodlari |
| `SYSTEM_INVARIANT_FAILED` | throw (buzilgan kontent, bug) — learner input bu yerga yetmaydi |

## 2. Yopiq domen → tanlov (choice)

- Domen yoki konfiguratsiya maydonning **to‘liq kanonik qiymatlar to‘plamini** bersa, maydon choice bo‘ladi. Manbalar:
  - `ManganeseRedoxModel.media()`;
  - `KINETICS_EFFECTS`, `EQUILIBRIUM_SHIFTS`;
  - boolean vazifalar;
  - `organic.json` molekula sinflari, nomlari, reaksiya turlari va mahsulotlari.
- Yagona kod joyi: `src/features/practice/answer-domain.ts` → `form-question.ts` (`FormQuestionModel`, `LearnerChoice {value; labelKey?; label}`) → `render.ts`.
- Oqim: domen/config → presentation → UI. UI kutilgan javobni hisoblamaydi.
- DOM’da faqat variant **indeksi** bo‘ladi; presentation uni kanonik tokenga qaytaradi. `correctAnswer`, `expectedToken` va `answerKey` hech qayerda yo‘q.
- Tartib label bo‘yicha deterministik. U to‘g‘ri javobga bog‘liq emas: bir domendagi turli activity’lar bir xil tartibni ko‘rsatadi.
- **Distraktor o‘ylab topilmaydi.** Repository faqat maqsad qiymatni saqlagan maydonlar free text bo‘lib qoladi va `OPTION_SET_MISSING` bilan hisobotga yoziladi (`reports/learner-answer-input-audit.json`). Bunday maydonlar: generic simulation, bounded-choice.

## 3. Label va lokalizatsiya siyosati

- Mavjud `createLocalizer`/`localize(key)` kengaytirildi, yangi i18n framework yo‘q.
- Yangi katalog: `content-src/locales/uz-latn/learner-interaction.json`, schema `kimyolab.locale.learner-interaction.v1`, `reviewStatus: pending`.
  - Kalitlar: `ui.*`, `field.*`, `step.*`, `evidence.*`, `action.*`, `answer.<domain>.<value>`.
  - Pack build va content client uni fail-closed tekshiradi (`LOCALIZATION_INVALID`). Umumiy `ui.*` kalitlari majburiy.
- **Fallback tartibi** (xom id hech qachon ko‘rinmaydi):
  1. katalogdagi label;
  2. muallif yozgan kontent label’i;
  3. raqamli umumiy label (`N-qadam`, `N-dalil`, `#N`).

  Har bir miss `LOCALIZATION_MISSING` bo‘lib qayd etiladi (`reports/learner-label-audit.json`).
- Lokalizatsiya bo‘lmasa ham kimyo bajarilishi buzilmaydi: session localization o‘qimaydi.
- Katalogdagi nomlar **display tarjima**, kimyo haqiqati emas. Kanonik token domen/config’da qoladi.

## 4. UI

- Choice: `fieldset`/`legend` va native radio. Klaviatura: Tab, strelkalar, Enter.
- Verdict matn bilan beriladi (“To‘g‘ri.” / “Noto‘g‘ri.”), faqat rang bilan emas. U submit’dan KEYIN engine natijasidan olinadi.
- Noto‘g‘ri yoki bo‘sh kiritish maydon yonidagi `role=alert` matnida ko‘rsatiladi; fokus maydonga qaytadi.

## 5. O‘lchash

- `scripts/learner-interaction.ts` quyidagilarni yozadi va `content:validate` ichida ishlaydi:
  - `learner-answer-input-audit.json`;
  - `learner-label-audit.json`;
  - `interaction-reliability.json`.
- Har bir javob maydoni 18 xil learner input bilan yangi session’da sinaladi.
- P2.0 o‘lchovi to‘ldirildi:
  - choice maydonida o‘quvchi token yozmaydi;
  - label id’ning o‘zi yoki mexanik “humanize” shakli bo‘lsa, raw id hisoblanadi;
  - generic trainer’ning `acceptedAnswers`i (muallif yozgan o‘zbekcha javob) internal token hisoblanmaydi.
- `MODEL_BASED` va depth qoidalari o‘zgarmadi: choice UI model emas.
