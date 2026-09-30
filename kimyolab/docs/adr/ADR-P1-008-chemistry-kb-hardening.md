# ADR-P1-008 — Chemistry knowledge-base hardening

- **Holat:** qabul qilindi (P1.7). Yangi renderer yo‘q.
- **Maqsad:** kimyo bazasini ko‘paytirish emas, uni **ishonchli** qilish.
- **Asosiy qoidalar:**
  - Agent yangi reaksiya yoki no-reaction faktini human review’siz kanonik haqiqatga aylantirmaydi.
  - “Not modeled” hech qachon “reaksiya bormaydi” degani emas.
  - Electrolysis renderer boshlanmadi.

## 1. Inventar (`reports/chemistry-kb-inventory.json`)

Barcha sonlar content’dan hisoblanadi.

| Ma’lumot | Soni |
|---|---|
| species | 84 |
| reaksiya | 28 (sharoitli: 11; aniq no-reaction: **0**) |
| dissociation qoidalari | 12 |
| insoluble ro‘yxati | 8 |
| hydrolysis tuzi | 4 |
| elektroliz yozuvi | **1** |

- Assertion’lar: **134**, hammasi `pending`; approved 0, stale 0.
- Manba: 104 tasi source’ga bog‘langan; 30 tasida manba yo‘q (element/modda nomlari — tarjima).
- Har reaksiya uchun qatorda bor: reaktant, mahsulot, tur, sharoit (teg + o‘lchov), kuzatuv, net-ion hosil qilib bo‘ladimi, `sourceRefs`, review holati, qaysi activity ishlatadi, kuzatuv flaglari.

## 2. Sharoit semantikasi — lug‘at (`content-src/chemistry/condition-vocabulary.json`)

- **Muammo:** KB sharoitlari erkin matnli teglar edi (“gentle heating”, “dilute acid”). P1.6 da ular talab sifatida so‘zma-so‘z solishtirilardi, deskriptor bilan talab ajralmasdi.
- **Yechim:** har teg bitta o‘lchovning bitta qiymatiga bog‘landi:
  - `heating` → `temperature: heated`;
  - `dilute acid` → `acid-concentration: dilute`;
  - va hokazo.
- **Kontekstlar** haqiqiy vaziyatni tasvirlaydi. `solution-mixing` = xona harorati, suyultirilgan kislota, alanga yo‘q.
- **Natija:**
  - `Zn + H2SO4 (dilute acid)` aralashtirish kontekstida mos keladi;
  - `NaCl + H2SO4 (concentrated acid + gentle heating)` mos kelmaydi → `CONDITION_DEPENDENT`.
- **Noma’lum teg** taxmin qilinmaydi: talab bajarilmagan hisoblanadi va gate FAIL (`CONDITION_TAG_UNKNOWN`). Bir o‘lchovga ikki qiymat → `CONDITION_TAG_CONFLICT`.
- Lug‘at hech bir reaksiyani o‘zgartirmaydi va qo‘shmaydi. U `pending` va review packet’da (`condition-term:*`, `condition-context:*`).
- **Kuzatuv matnidan sharoit chiqarilmaydi.**

## 3. Uch klass (+ sharoitga bog‘liq)

Klasslar: `MODELED_REACTION`, `MODELED_NO_REACTION`, `NOT_MODELED` (`classifyMatch`, P1.6 closeout). Juftlik qamrovida qo‘shimcha **`CONDITION_DEPENDENT`**: yozuv bor, lekin boshqa sharoit talab qiladi.

**No-reaction:**
- Domain qo‘llab-quvvatlaydi, sintetik fixture bilan isbotlangan.
- Production KB’da 0 ta yozuv: **KNOWN CONTENT GAP**.
- Agent no-reaction yozuvi **yaratmadi**. Faqat nomzodlar chiqarildi.

## 4. Ionic juftlik qamrovi (`reports/ionic-pair-coverage.json`)

Tokcha content’dan olinadi (activity ID kodda yozilmagan). 8.1 tokchasi: 21 juftlik, **100% klassifikatsiya qilingan**.

| Klass | Soni |
|---|---|
| MODELED_REACTION | 3 |
| MODELED_NO_REACTION | 0 |
| CONDITION_DEPENDENT | 1 (NaCl+H₂SO₄) |
| NOT_MODELED | 17 |

`NOT_MODELED` juftliklar uchun **nomzod** — eruvchanlik qoidalaridan chiqarilgan **taklif**, kanonik emas:
- **reaction-candidate (3):** AgNO₃+BaCl₂ va AgNO₃+ZnCl₂ (AgCl insoluble ro‘yxatida), H₂SO₄+NaOH (H⁺+OH⁻ → suv);
- **no-reaction-candidate (7);**
- **unclassifiable (7):** qoidalar yetarli emas.

Har nomzodda: juftlik, nega kerak (o‘quvchi tokchasida), ta’sir qilingan activity, hozirgi xulq (“modelda yo‘q”), talab qilinadigan qaror (`review-packets/chemistry-kb/candidates.json`).

## 5. Species identifikatsiyasi va holat

- Reaksiya, eruvchanlik, hydrolysis va elektroliz ma’lumotlaridagi har formula ro‘yxatdan o‘tgan species. Ionlar ham (Ag⁺, Cl⁻, …) ro‘yxatda. Buzilishi → FAIL `SPECIES_REF_UNREGISTERED` / `ION_REF_INVALID`.
- Kalit — `speciesId`, formula esa ko‘rsatish uchun. 84 species, formulalar noyob.
- **Holat semantikasi:** `aq|s|l|g` tekshiriladi (`PHASE_INVALID`).
  - Matcher’da holat ko‘rsatilmagan = mos.
  - IonicEngine’da holat **faqat reaksiya darajasidagi ma’lumotdan** olinadi: dissociation qoidasi → aq, yozuvdagi aniq holat, insoluble → s, H₂O → l.
  - **P1.7 topilmasi:** species’ning standart holati (masalan NaBr(s)) eritmadagi reaksiya holati emas. Uni ishlatish noto‘g‘ri tenglama berardi (“Ag⁺ + NaBr(s) → …”), shuning uchun **ishlatilmaydi**.

## 6. IonicEngine fail-closed

- Hech bir qoida yoki holat qamramaydigan modda endi jimgina “molekulyar” deb olinmaydi → `NET_IONIC_UNSUPPORTED:<formula>`.
- 28 reaksiyadan **5 tasi** net-ion jihatdan hosil qilinadi. Hammasi atom va zaryad bo‘yicha balanslangan (property test).
- Qolganlari hujjatlashtirilgan “unsupported” (hisobotda qaysi modda yetishmasligi ko‘rsatilgan).

## 7. Review workflow (faqat inson)

- **Assertion:** `id`, kategoriya, da’vo, strukturali ma’lumot, `sourceRefs`, ta’sir qilingan activity’lar, `currentHash` (kategoriya + ma’lumot + manba bo‘yicha sha256).
- **Kategoriyalar:** reaction, no-reaction, condition, observation, solubility, hydrolysis, **indicator (alohida)**, species-name, electrolysis.
- **Holat register’dan hisoblanadi** (`content-src/chemistry-reviews.json`, bo‘sh). Ma’lumotdagi `reviewStatus` maydoni emas.
  - Ma’lumot `approved` desa-yu, register’da tasdiq bo‘lmasa → FAIL `APPROVAL_NOT_FROM_REGISTER`.
- **Tooling:**
  - `npm run chemistry:kb` — packet va hisobotlar;
  - `scripts/chemistry-review/import.ts` — yagona register yozuvchisi. U quyidagilarni rad etadi:
    - avtomatlashtirilgan identitet (agent/bot/claude…);
    - `chemistry` bo‘lmagan rol;
    - izohsiz rad etish;
    - eski hash;
    - noma’lum assertion.
- Guard: register faqat importer tomonidan yoziladi (`HUMAN_APPROVAL_WRITTEN_BY_TOOLING`, `REVIEW_REGISTER_FILE` identifikatori ham).
- **Stale:** tasdiqlangan assertion o‘zgarsa → `stale`, tasdiq hisobga olinmaydi, gate FAIL `APPROVAL_STALE` (test).

## 8. Gate (`chemistry:validate` ichida)

- **FAIL (noto‘g‘ri content):**
  - ro‘yxatdan o‘tmagan species, noto‘g‘ri ion yoki holat;
  - noma’lum yoki ziddiyatli sharoit tegi;
  - ziddiyatli yoki takroriy reaksiya, `MATCHER_AMBIGUOUS`;
  - noto‘g‘ri register yozuvi, stale tasdiq, manbasiz tasdiq, register’siz tasdiq;
  - noma’lum nameKey.
- **PENDING (to‘liq emas, lekin to‘g‘ri; CI yiqilmaydi):**
  - review kutilmoqda;
  - `CHEMISTRY_REVIEW_REQUIRED` flaglari;
  - no-reaction yozuvlari yo‘q;
  - net-ion qo‘llab-quvvatlanmaydi;
  - lokalizatsiya kutilmoqda.
- **Hozir:** gate `PENDING`, **0 FAIL**, 165 pending.

## 9. Kuzatuv yaxlitligi (faqat strukturaviy flag, tuzatish emas)

`CHEMISTRY_REVIEW_REQUIRED` flagi qo‘yilgan yozuvlar:
- `rxn.naoh-hcl`, `rxn.h2-combustion`, `rxn.cl2-kbr`, `rxn.br2-ki` — rang o‘zgarishi aniq rang ko‘rsatilmagan;
- `rxn.znoh2-hcl` — “cho‘kma” kuzatuvi bor, lekin mahsulot insoluble emas;
- `rxn.nacl-h2so4` — “gaz” kuzatuvi bor, lekin mahsulot species’i standart holatda gaz emas.

Agent hech birini **o‘zgartirmadi**.

## 10. Lokalizatsiya

- Mavjud `nameKey` konvensiyasi ishlatildi. Yangi i18n freymvorki yo‘q.
- `content-src/locales/uz-latn/chemistry-species.json` — 10 ta modda nomi (hozir o‘quvchiga ko‘rinadigan reagent va tuzlar), `pending`.
- Minimal resolver `createLocalizer`: `element.<Symbol>` va `species.<id>.name` → matn yoki `null` (formula ko‘rsatiladi).
- Mount context’dagi P1.4 `elementName` o‘rniga umumiy `localize(key)` keldi. Context maydonlari soni o‘zgarmadi (4 ta).
- Domain holatida **nom yo‘q**, faqat `nameKey`.
- Ionic tokchada “AgNO₃ — kumush nitrat”. Tarjimalar tasdiqlanmagan va review packet’da (`species-name:*`).

## 11. Elektroliz tayyorligi (`reports/electrolysis-model-readiness.json`)

- 1 ta yozuv: CuCl₂(aq), inert → Cu / Cl₂.
- O‘lchovlar: phase (aq/l), elektrod (inert/active), kation, anion. Hammasi bitta qiymat bilan qamralgan.
- **Renderer start gate** (black-swan asosida):
  - ≥ 2 mustaqil o‘quvchi tanlovi, har biri ≥ 2 modellashtirilgan qiymat bilan;
  - ≥ 3 turli katod/anod natijasi (kanned bo‘lmaydigan eng kichik 2×2 dizayn).
- Hozir **NOT_READY**. Renderer yozilmadi.

## 12. Pilot va global readiness

- Pilot holatlari o‘zgarmadi. lu.9.15 `PILOT_READY` emas.
- Agent sign-off bermadi.
- `globalStrictEnforcement = false`.
