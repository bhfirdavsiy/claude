# KimyoLab v20 — Sinco build

Bu build uchta manbani birlashtiradi:

1. `source/KimyoLab_v20_nazariya_amaliyot_mapping.xlsx` — 122 nazariya va 62 amaliyot uchun tasdiqlangan mapping bazasi.
2. `source/KimyoLab_v19_reference.html` — v19 laboratoriya, nazariya va 118 element ma'lumotlari.
3. Foydalanuvchi taqdim etgan **Sinco - Data Science & Analytics HTML5 Template** light default dizayn tizimi.

## Sahifalar
- `index.html` — Sinco hero va umumiy dashboard.
- `curriculum.html` — 122 qatorlik Mavzu studiyasi. Excel mappingining barcha asosiy ustunlari ko'rsatiladi.
- `practices.html` — 62 amaliy band, reverse mapping va v19 scenario tafsilotlari.
- `lab.html` — v19 bosqichlari asosidagi interaktiv tajriba stepperi.
- `periodic.html` — 118 elementli davriy jadval.
- `trainers.html` — mapping bo'yicha trenajyor talab qiladigan mavzular.

## Data
- `data/curriculum.json` — 122 nazariya.
- `data/practices.json` — 62 amaliyot + v19 equipment/materials/safety/steps/tasks.
- `data/elements.json` — 118 element.
- `data/summary.json` — sinf va qamrov xulosasi.
- `data/methodology.json` — mapping metodikasi.

## Ishga tushirish
Node.js o'rnatilgan bo'lsa Windowsda `start.bat` ni bosing. Brauzerda:
`http://127.0.0.1:4173`

Yoki terminalda:
`npm start`

## Tekshirish
`npm test`
