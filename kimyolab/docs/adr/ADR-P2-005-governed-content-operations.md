# ADR-P2-005 — Governed theory authoring va source operations

- **Holat:** qabul qilindi (P2.4).
- **Scope:** infratuzilma. P2.3 dagi structured-theory modeli **real inson ishi** uchun ishlaydigan qilindi:
  registered source → inson muallif → chemistry review → didactic review → approved content → governed build.
- **Qilinmadi:**
  - tushuntirish, misol, noto‘g‘ri tushuncha, xulosa, manba yoki distraktor yozilmadi;
  - hech bir manba authoritative deb e’lon qilinmadi, hech bir blok tasdiqlanmadi;
  - hech qanday inson identity’si (muallif yoki reviewer) yaratilmadi.

## 1. Source intake

- Taklif: `content-src/source-intake/<sourceId>.json`, schema `kimyolab.source-intake.v1` (`schemas/source-intake.schema.json`).
- Metadata: `sourceId`, nomi, nashriyot/vakolatli organ, nashr/yil, til, kategoriya, bibliografik ma’lumot, sahifa/bo‘lim havolasi imkoniyati, lokal hujjat hash’i, taklif qiluvchi (`submittedBy`), holat va qarorlar.
- Intake kategoriyalari: CURRICULUM, TEXTBOOK, OFFICIAL_STANDARD, AUTHORITATIVE_REFERENCE, LOCALIZATION_GLOSSARY. INTERNAL_PROPOSAL intake qilinmaydi.
- Holat **hisoblanadi** (`src/authoring/source-intake.ts`, `sourceGovernance`):

| Holat | Shart |
|---|---|
| DRAFT | `status: draft`, joriy qaror yo‘q |
| READY_FOR_REVIEW | yuborilgan, joriy hash’ga qaror yo‘q (eski qarorlar STALE) |
| APPROVED | inson (automation emas, taklif qiluvchi emas) **joriy hash**ga `approved` qildi va **aynan da’vo qilingan kategoriyani** qabul qildi; boshqa muammo yo‘q |
| CHANGES_REQUESTED / REJECTED | joriy hash’ga shunday qaror |

- Mashina qiladi: schema va qoidalarni tekshiradi, hujjat hash’ini hisoblaydi, takrorni topadi (id, hujjat hash’i, nom + nashriyot + nashr + yil). Mashina **tasdiqlamaydi**.
- `npm run source:queue` → `review-packets/source-intake/queue.json`.
- `npm run source:apply -- <intake.json>`: faqat inson; CI/agent muhitida rad etiladi. APPROVED va takrorsiz bo‘lmasa yozmaydi. Registry yozuvi: `classification: HUMAN_ACCEPTED`, `submittedBy`, `acceptedBy`, `acceptedAt`, `reviewedHash`. Registry formati baytma-bayt saqlanadi.

## 2. Structured theory: packet → draft → apply

- **Packet** (`kimyolab.theory-authoring-packet.v1`) — workbench, repozitoriy va apply o‘rtasidagi yagona round-trip format (`src/authoring/authoring-packet.ts`).
  - `packetToEntry` faqat slot ko‘rsatmasini (`minChars`) olib tashlaydi; matn, qadam, blok tartibi o‘zgarmaydi.
  - `packetWithEntry` slotlarni to‘ldiradi va `contentHashes`ni yangilaydi; eksportdan keyin o‘zgartirilgan packet `PACKET_HASH_MISMATCH` beradi.
  - 122 ta packet saqlanadi; endi `slots.version` (bo‘sh) bor. Kanonik nazariyasi bor mavzuning packet’i o‘sha kontentni olib yuradi.
- `npm run theory:import -- <packet.json>` → `authoring-drafts/theory/<lu>.json`: kanonik **emas**, pack’ga kirmaydi.
- `npm run theory:check -- <packet.json>`: apply tekshiruvlari, yozuvsiz (har qanday muhitda).
- `npm run theory:apply -- <packet.json>`: faqat inson; CI/agent muhitida rad etiladi. Tekshiradi: packet, mavzu/nazariya bog‘lanishi, JSON Schema, kontrakt (to‘liqlik, placeholder, manba ro‘yxatda va qabul qilinadigan), muallif, ikkala review, hash’lar, self-review, bir kishi ikki rolda. Hammasi to‘g‘ri va **har blok APPROVED** bo‘lsa, `content-src/theory-structured/<theoryId>.json` deterministik yoziladi (kalitlar tartiblangan, massiv tartibi saqlangan), keyin pack va nazariya hisobotlari qayta yaratiladi.
- **Fail-closed qo‘riqchi:** repozitoriy build’i (`content:pack`) va `content:validate` har kanonik yozuv dual-review APPROVED ekanini qayta tekshiradi (`assertCanonicalTheoryApproved`). Qo‘lda yozilgan yoki keyin tahrirlangan (STALE) fayl build’ni to‘xtatadi. Approval yo‘q → kanonik apply yo‘q.

## 3. Workbench

- Yagona offline `review-packets/reviewer-workspace.html`ga uchta tab qo‘shildi: **Nazariya (structured)**, **Manbalar**, **Option set**.
- Sahifa governance kodini **o‘zi bajaradi**: `src/` dagi TypeScript modullar type-strip qilinib, har biri o‘z scope’ida joylanadi (`scripts/lib/browser-module-bundle.ts`). Sahifadagi hash va holat — apply hisoblaydigan hash va holat (unit test buni solishtiradi). Node’ga bog‘liq kod joylanmaydi.
- Nazariya: sinf, mavzu, natijalar, konseptlar, hozirgi MINIMAL nazariya, qabul qilinadigan manbalar, bloklar, muallif, chemistry/didactic review, joriy hash va har review hash’i, STALE ogohlantirishi, validatsiya xatolari. Tahrir: tushuntirish, misollar, noto‘g‘ri tushunchalar, xulosa, sourceRefs. Import/eksport packet.
- Review’ni yuqoridagi Reviewer bo‘limidagi shaxs beradi. Sahifa automation identity’ni, muallifning o‘zini va bir kishining ikki rolini rad etadi; qaror joriy hash’ga bog‘lanadi.
- Muallif/reviewer identity bo‘sh boshlanadi; standart yoki “demo” odam yo‘q. Slotlar bo‘sh boshlanadi.
- Sahifa repozitoriyga yozmaydi va tarmoqqa chiqmaydi (CSP `connect-src 'none'`); faqat fayl yuklab beradi.

## 4. OPTION_SET_MISSING

- 23 activity / 32 maydon alohida tabda. Draft (`kimyolab.option-set-draft.v1`, `src/authoring/option-set-draft.ts`) structured-theory governance primitivlarini qayta ishlatadi: bitta reviewable blok, chemistry + didactic, ikki odam, bir hash, tahrir → STALE.
- Tekshiruv: kamida 2 variant, kanonik maqsad variantlar ichida, takror yo‘q, har variantga yorliq, har distraktorga sabab, manba, inson muallif.
- Platforma variant yoki distraktor taklif qilmaydi. Kanonik kiritish mavjud governed authoring yo‘li orqali (P1.9); P2.4 yangi apply qo‘shmadi.

## 5. Hisobot

`reports/theory-authoring-status.json` — faqat faktlar: 122 mavzu, har biri bitta holatda (notStarted, draft, readyForReview, chemistryReviewed, didacticReviewed, approved, changesRequested, missingSource, staleReview); manba sonlari va kategoriyalari, intake holatlari; manba, mualliflik, chemistry va didactic review bo‘yicha bloklangan mavzular. Prioritet balli yo‘q. Progress formulasiga kirmaydi.

## 6. Learner runtime

Authoring modullari `src/authoring/` da: hech bir learner build (preview, production, release, standalone) uni nusxalamaydi. O‘lchov: app-preview +150 bayt, standalone +304 bayt — faqat `isAutomationIdentity` umumiy `identity.ts` modulga ko‘chgani uchun.
