# Assessment review packet — q.9.15.01

> Faqat reviewer uchun. To‘g‘ri javob shu hujjatda ko‘rinadi — o‘quvchi pack’i bilan aralashtirmang.

| Maydon | Qiymat |
|---|---|
| itemId | `q.9.15.01` |
| LearningUnit | `lu.9.15` — Elektroliz va uning amaliy ahamiyati |
| grade | 9 |
| itemVersion | 1.0.0-rc.1 |
| itemHash (sha256) | `2c280300b79bc99cd1a9dd6e33f1705dad0bc10c55c33da948ab985ee539cba6` |
| provenance | aniqlanmagan (bankda yozilmagan) — reviewer tekshirsin |

## Savol

Elektroliz jarayonida katodda qaysi jarayon sodir bo‘ladi?

## Variantlar

- **A.** Qaytarilish  ← to‘g‘ri javob
- **B.** Oksidlanish
- **C.** Bug‘lanish
- **D.** Neytrallanish

**To‘g‘ri javob:** A

**Izoh:** Katodda zarrachalar elektron qabul qiladi, ya’ni qaytarilish sodir bo‘ladi.

## Bog‘lanishlar

- Konseptlar: `concept.c184`, `concept.c186`
- Taklif qilingan outcome: `lu.9.15#o1` — “9.10 CuCl2 va KI eritmalari elektrolizi bevosita mos.”

## Reviewer to‘ldiradi

- Cognitive demand (eslash / tushunish / qo‘llash / tahlil): ____
- Maqsad qilingan misconception: ____
- Outcome bog‘lanishi to‘g‘rimi? (ha / yo‘q, izoh): ____

### Kimyoviy to‘g‘rilik (chemistry reviewer)

- [ ] Kimyoviy jihatdan to‘g‘ri javob faqat bitta
- [ ] Distraktorlar kimyoviy jihatdan noto‘g‘ri, lekin mantiqli
- [ ] Terminlar o‘quv dasturiga mos
- [ ] Formula/belgilar to‘g‘ri yozilgan

### Til va didaktika (didactic reviewer)

- [ ] Savol o‘zbek tilida aniq va bir ma’noli
- [ ] Variantlar uzunligi va uslubi bir xil
- [ ] To‘g‘ri javobga ishora (clue) yo‘q
- [ ] Izoh o‘quvchi uchun tushunarli

## Qaror

Qaror `review-register.template.json` nusxasida yoziladi (rol bo‘yicha alohida qator):
`decision` (approved | rejected | changes_requested), `reviewerId` (shaxs, avtomatlashtirish emas), `reviewedAt` (ISO), `comment`.
Didactic reviewer qo‘shimcha ravishda `outcomeDecision` (confirm | reject | change_required) yozadi — outcome bog‘lanishi faqat taklif.
Tasdiqdan boshqa har qanday qaror uchun `comment` majburiy. Chemistry va didactic tasdig‘ini ikki xil shaxs beradi.
Import: `npm run assessment:review:import -- <to‘ldirilgan-register.json>`.
