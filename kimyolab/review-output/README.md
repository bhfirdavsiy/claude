# review-output/

Workbench’dan eksport qilingan qaror fayllari (`review-decisions-*.json`) shu yerga qo‘yiladi. Bu fayllar gitga kirmaydi (`.gitignore`).

1. `npm run review:validate -- review-output/<fayl>.json`: import oldidan tekshiruv, hech narsa yozmaydi.
2. `npm run review:import -- review-output/<fayl>.json`: faqat inson ishga tushiradi (CI yoki agent muhitida rad etiladi). Mavjud importerlar orqali kanonik registrlarga yozadi.
3. `npm run review:build`: hisobotlar va workbench qayta quriladi.

Pilot sign-off import qilinmaydi: pilot owner uni `content-src/pilot-signoffs.json`ga pull request orqali qo‘shadi (ADR-P1-004).
