# ADR-P2-004 — Structured theory system va authoring asosi

- **Holat:** qabul qilindi (P2.3).
- **Scope:** infratuzilma — kontrakt, validatsiya, renderer, audit, authoring navbati.
- **Qilinmadi:**
  - kimyo matni, misol, noto‘g‘ri tushuncha yoki manba o‘ylab topilmadi;
  - hech bir blok tasdiqlanmadi;
  - assessment banki, rus/kirill lokalizatsiyasi, deploy qilinmadi.

## 1. Kontrakt

Mavzu nazariyasi **STRUCTURED** hisoblanadi, faqat quyidagilarning hammasi bajarilsa:

- inson yozgan yozuv `content-src/theory-structured/<theoryId>.json` mavjud;
- u `schemas/structured-theory.schema.json`ga (`kimyolab.structured-theory.v1`) mos;
- quyidagi to‘rt blok bor:
  1. `explanation` — kamida 300 belgi;
  2. `workedExamples[]` — kamida bitta (masala, yechim qadamlari, javob);
  3. `misconceptions[]` — kamida bitta (xato fikr va to‘g‘ri izoh);
  4. `summary` — kamida bitta band.

Har blok o‘z provenance’ini saqlaydi:

- `sourceRefs` — ro‘yxatdan o‘tgan manbalar (`content-src/source-registry.json`), kategoriyasi SOURCE_POLICY bo‘yicha qabul qilinadigan (CURRICULUM, TEXTBOOK, OFFICIAL_STANDARD, AUTHORITATIVE_REFERENCE);
- `authoredBy` — inson; automation identifikatori rad etiladi;
- `status` — muallifning ish holati: `draft` yoki `ready-for-review`. “Approved” muallif tomonidan **yozilmaydi**.
- `reviews[]` — har bir review’da: reviewer, rol (`chemistry` yoki `didactic`), qaror, sana va ko‘rib chiqilgan kontentning `reviewedHash`i.

**Ikki kishilik review (P2.3 closeout A2).** Blok APPROVED holatiga faqat `blockGovernance` orqali o‘tadi, va quyidagilarning hammasi bajarilishi kerak:

1. blokning JORIY revision’i (matn va `sourceRefs`) uchun tasdiqlovchi chemistry review bor;
2. xuddi shu revision uchun tasdiqlovchi didactic review bor;
3. ikki review ikki alohida inson tomonidan qilingan;
4. ikkalasi bir xil hash’ga bog‘langan;
5. hech biri automation identifikatori emas;
6. hech biri blok muallifi emas.

Qolgan holatlar:

| Holat | Natija |
|---|---|
| Bitta review | REVIEW_PENDING |
| Har xil revision’larga qilingan review’lar | STALE_REVIEW |
| Matn yoki manba tahrirlandi | eski review’lar STALE bo‘ladi |
| Self-review, automation reviewer, bir kishi ikki rolda | build’ni to‘xtatadi |

Nazariya yozuvi APPROVED bo‘lishi uchun uning har bir bloki APPROVED bo‘lishi kerak.

Yagona chuqurlik qoidasi — `classifyTheoryDepth`:

| Holat | Chuqurlik |
|---|---|
| Legacy blok’lar (hozirgi 122 ta) | MINIMAL |
| Shablon, placeholder, bo‘sh slot, to‘liqsiz yoki manbasiz yozuv | hech qachon STRUCTURED emas |
| Nazariya yo‘q | NONE |

Review holati — governance. U chuqurlikka ta’sir qilmaydi, chuqurlik ham uni tasdiqlamaydi.

## 2. Fail-closed zanjir

- **Build** (`content:pack`, `scripts/lib/structured-theory.ts`):
  - to‘liqsiz yoki buzuq yozuv build’ni to‘xtatadi (schema, placeholder, automation muallif yoki reviewer, self-review, bir kishi ikki rolda, noma’lum nazariya yoki mavzu);
  - ro‘yxatda yo‘q yoki qabul qilinmaydigan manbaga tayangan yozuv pack’ga kirmaydi.
  - Learner pack’dagi `theory-structured.json` faqat to‘liq va manbali yozuvlarni hamda ular keltirgan manbalar nomini oladi.
- **Brauzer:**
  - `ContentClient` faylni integrity bilan yuklaydi (eski pack’larda fayl bo‘lmasa, MINIMAL);
  - `structuredTheoryView` yozuvni qayta tekshiradi, noto‘g‘ri bo‘lsa MINIMAL.

## 3. Renderer

`src/features/theory/structured-render.ts`:

- har bo‘lim nomlangan `section`; bosqich `h2`si ostida `h3`, misol uchun `h4`;
- ma’no matnli belgi bilan beriladi (“Xato fikr:”, “To‘g‘risi:”), faqat rang bilan emas;
- `media` lazy yuklanadi, host asset yo‘li orqali;
- manbalar ro‘yxati ko‘rsatiladi; tasdiqlanmagan nazariyada `role=note` izohi chiqadi.

Hech narsa hisoblanmaydi, matn o‘zgartirilmaydi. MINIMAL legacy render o‘zgarmadi (`data-theory-depth="MINIMAL"`). Animatsiya framework’i yoki yangi dependency qo‘shilmadi.

## 4. Authoring

- `review-packets/theory-authoring/units/<lu>.json` (122 ta) har mavzu uchun faktlarni beradi:
  - maqsadlar, konseptlar, hozirgi MINIMAL nazariya;
  - manbalar, bog‘liq amaliyot va itemlar;
  - **bo‘sh slot’lar**, manba talablari va review checklist.
- `queue.json`da prioritet balli yo‘q; tartib id bo‘yicha.
- `reports/theory-depth-audit.json` hisobotida: chuqurlik, bloklar mavjudligi, yetishmayotgan bloklar, provenance va review holati.

## 5. Progress

Progress formulasi o‘zgarmadi. Real inson kontenti bo‘lmaguncha 122/122 MINIMAL qoladi va learning product raqami o‘zgarmaydi.
