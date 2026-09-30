# Assessment review packet — q.9.15.03

> Faqat reviewer uchun. To‘g‘ri javob shu hujjatda ko‘rinadi — o‘quvchi pack’i bilan aralashtirmang.
> Bu paket **approval emas**: u faqat qaror qabul qilish uchun ko‘rinish. Qaror register orqali import qilinadi.

| Maydon | Qiymat |
|---|---|
| itemId | `q.9.15.03` |
| LearningUnit | `lu.9.15` — Elektroliz va uning amaliy ahamiyati |
| grade | 9 |
| itemVersion | 1.0.0-rc.1 |
| itemHash (sha256) | `035b9511086e81d9db2ca8f020afb589cb0b8957bf98e653649c6e362777af20` |
| provenance | aniqlanmagan (bankda yozilmagan) — reviewer tekshirsin |

## Savol

Musbat zaryadlangan ionlar elektr maydonida qaysi elektrod tomon harakatlanadi?

## Variantlar

- **A.** Katod tomon  ← to‘g‘ri javob
- **B.** Anod tomon
- **C.** Harakatlanmaydi
- **D.** Faqat eritma yuzasiga

**To‘g‘ri javob:** A

**Izoh:** Kationlar manfiy elektrod — katod tomon harakatlanadi.

## Bog‘lanishlar

- Konseptlar: `concept.c184` (Anod), `concept.c186` (eritma)
- Taklif qilingan outcome: `lu.9.15#o1` — “9.10 CuCl2 va KI eritmalari elektrolizi bevosita mos.”
- Konsept va outcome bog‘lanishi agent/muallif **taklifi**: didactic reviewer `outcomeDecision` bilan tasdiqlaydi yoki rad etadi.

## Reviewer to‘ldiradi

### Kimyoviy aniqlik (chemistry reviewer)

- [ ] Kimyoviy jihatdan to‘g‘ri javob faqat bitta
- [ ] Distraktorlar kimyoviy jihatdan noto‘g‘ri, lekin mantiqli
- [ ] Terminlar o‘quv dasturiga mos
- [ ] Formula/belgilar to‘g‘ri yozilgan

### Didaktik maqsad (didactic reviewer)

- Cognitive demand (eslash / tushunish / qo‘llash / tahlil): ____
- Maqsad qilingan misconception: ____
- Outcome bog‘lanishi to‘g‘rimi? (confirm / reject / change_required, izoh): ____

### Qiyinchilik

- [ ] oson   - [ ] o‘rta   - [ ] qiyin   — izoh: ____

### Chalg‘ituvchi variantlar sifati

| Variant | Matn | Mantiqli, lekin kimyoviy noto‘g‘ri? | Izoh |
|---|---|---|---|
| B | Anod tomon | ha / yo‘q | |
| C | Harakatlanmaydi | ha / yo‘q | |
| D | Faqat eritma yuzasiga | ha / yo‘q | |

### Til va didaktika (didactic reviewer)

- [ ] Savol o‘zbek tilida aniq va bir ma’noli
- [ ] Variantlar uzunligi va uslubi bir xil
- [ ] To‘g‘ri javobga ishora (clue) yo‘q
- [ ] Izoh o‘quvchi uchun tushunarli

## Qaror

| Rol | Reviewer decision | outcomeDecision | Reviewer (shaxs) | Sana | Reviewer comment |
|---|---|---|---|---|---|
| chemistry | approved / rejected / changes_requested | — | | | |
| didactic | approved / rejected / changes_requested | confirm / reject / change_required | | | |

Qaror `review-register.template.json` nusxasida yoziladi (rol bo‘yicha alohida qator):
`decision` (approved | rejected | changes_requested), `reviewerId` (shaxs, avtomatlashtirish emas), `reviewedAt` (ISO), `comment`.
Didactic reviewer qo‘shimcha ravishda `outcomeDecision` (confirm | reject | change_required) yozadi — outcome bog‘lanishi faqat taklif.
Tasdiqdan boshqa har qanday qaror uchun `comment` majburiy. Chemistry va didactic tasdig‘ini ikki xil shaxs beradi.
Import: `npm run assessment:review:import -- <to‘ldirilgan-register.json>`.
