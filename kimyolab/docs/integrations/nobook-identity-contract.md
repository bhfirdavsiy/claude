# NOBOOK identity contract (P0.15.3)

Holat: **qabul qilingan qaror** — Variant B (anonim local-first identity) + Variant C (token server chegarasida).

## 1. Manba: `unique_id` semantikasi

NOBOOK Open Platform hujjati (“如何获取身份验证令牌”, `POST https://nbapi.nobook.com/v1/auth`):

- so‘rov maydonlari: `app_key`, `pid_scope`, `timestamp` (Pekin vaqti, soniya), `unique_id`, `version`, `sign`;
- `sign` = barcha qiymatlar (shu jumladan `app_secret`) ketma-ket ulangan qatorning MD5’i;
- **`unique_id` — joriy tizimdagi foydalanuvchi ID’si; maxfiylik uchun foydalanuvchi ID’sining mapping’i uzatilishi mumkin.**

Manbalar: <https://open.nobook.com/docs/1.2/tutorial-integration/get-token/>,
<https://open.nobook.com/docs/2.0/tutorial-integration/get-token/>.

Demak `unique_id` — request correlation emas (Variant A emas), balki **foydalanuvchi identifikatori**.
Hamkor tomonida saqlangan sahnalar, litsenziya hisobi va statistikasi shu identifikator bo‘yicha yuritiladi.

P0 (`ece136f`) dagi `kimyolab-${bindingId}` qiymati shu sababli noto‘g‘ri edi: barcha o‘quvchilar bitta
NOBOOK foydalanuvchisiga birlashib ketardi. P0.15 buni tuzatadi.

## 2. Qaror

KimyoLab’da foydalanuvchi akkaunti yo‘q (local-first). Shuning uchun:

| Qatlam | Qiymat | Qayerda yashaydi | PII? |
|---|---|---|---|
| `installationId` | tasodifiy UUID v4 | brauzer, `IndexedDB.metadata['installation.id']` | yo‘q |
| `learnerRef` (so‘rovda) | `installationId` ning o‘zi | brauzer → KimyoLab server (`POST /api/external-labs/nobook/session`) | yo‘q |
| `unique_id` (NOBOOK’ga) | `kl_` + HMAC-SHA256(`identityKey`, `kimyolab.nobook.unique_id.v1:` + learnerRef) ning 32 hex belgisi | faqat server → NOBOOK | yo‘q, qaytarib bo‘lmaydi |
| `identityKey` | `NOBOOK_IDENTITY_KEY` yoki `HMAC(app_secret, 'kimyolab-nobook-identity-key-v1')` | faqat server muhitida | — |
| NOBOOK auth javobi / token | — | server xotirasida, brauzerga **qaytarilmaydi** | — |

Qoidalar:

1. **Identity = o‘rnatish (installation), faoliyat emas.** Bitta brauzer profilidagi o‘quvchi barcha NOBOOK
   laboratoriyalarida bir xil `unique_id` ga ega (saqlangan sahnalar bo‘linib ketmaydi). Faoliyat konteksti
   (`bindingId`, `learningUnitId`, modul) identity’ga qo‘shilmaydi — u binding orqali alohida tekshiriladi va
   server logida `requestId` bilan korrelyatsiya qilinadi.
2. **PII yuborilmaydi.** Server `learnerRef` ni faqat UUID v4 formatida qabul qiladi (email, ism, telefon
   422 `REQUEST_FIELD_INVALID`). Brauzer ism/sinf/maktab ma’lumotini umuman bilmaydi.
3. **Pseudonim qaytarilmaydi va bog‘lanmaydi.** `unique_id` kalitli HMAC; kalit serverdan chiqmaydi. NOBOOK
   `unique_id` dan `installationId` ni tiklay olmaydi, KimyoLab evidence/attempt ID’lari bilan bog‘lay olmaydi.
4. **Token server ↔ NOBOOK chegarasida qoladi (Variant C).** Brauzer faqat `{experimentalUrl, moduleId, bindingId}`
   oladi. `app_key`, `app_secret`, `pid_scope`, `sign`, token — hech qachon javobda yoki logda yo‘q.
5. **Client ishonchli ma’lumot belgilamaydi.** Provider va modul faol content pack’dagi (checksum bilan
   tekshirilgan) binding’dan olinadi; `learnerRef` identity’ni emas, faqat pseudonim urug‘ini beradi.

## 3. Tahdidlar va qabul qilingan cheklovlar

- **Boshqa o‘quvchi nomidan kirish.** `learnerRef` 122-bit tasodifiy qiymat; uni taxmin qilib bo‘lmaydi. Uni
  bilgan odam (masalan, bitta kompyuterdan foydalanuvchilar) bir xil NOBOOK sahnalarini ko‘radi — bu
  akkauntsiz local-first modelning tabiiy chegarasi. Haqiqiy autentifikatsiya cloud sync (P3) bilan keladi;
  o‘shanda `learnerRef` o‘rniga server tomonidagi `userId` ishlatiladi (versiya `v2` prefiksi bilan).
- **Brauzer ma’lumotlari tozalansa** yangi `installationId` yaratiladi → yangi NOBOOK pseudonimi. Eski sahnalar
  hamkor tomonida qoladi, lekin bog‘lanmaydi. Bu maxfiylik nuqtai nazaridan qabul qilinadi.
- **Kalit rotatsiyasi.** `NOBOOK_IDENTITY_KEY` o‘zgarsa, barcha pseudonimlar o‘zgaradi. Kalit alohida belgilanmasa
  `app_secret` dan kelib chiqadi, shuning uchun `app_secret` rotatsiyasi ham pseudonimlarni o‘zgartiradi —
  bunga yo‘l qo‘ymaslik uchun productionda `NOBOOK_IDENTITY_KEY` ni alohida belgilash tavsiya etiladi.
- **Rate limit** jarayon ichida (P0.10); `learnerRef` rate-limit kaliti sifatida ishlatilmaydi (IP bo‘yicha).

## 4. Hali hamkor bilan tasdiqlanishi kerak (identity semantikasiga ta’sir qilmaydi)

- NOBOOK auth javobidagi token keyingi “experiment address” so‘roviga kerakmi. Hozir `NOBOOK_EXPERIMENT_URL`
  statik; token kerak bo‘lsa, u baribir faqat server tomonida ishlatiladi (qoida 4 o‘zgarmaydi).
- `unique_id` uzunligi/belgi cheklovi. `kl_` + 32 hex = 35 ta ASCII belgi; hujjatda cheklov ko‘rsatilmagan.

## 5. Kod va testlar

- `src/runtime/progress/indexeddb-store.ts` — `getOrCreateInstallationId()`
- `src/integrations/external-labs/nobook/nobook-provider.ts` — so‘rovda faqat `{bindingId, learningUnitId, learnerRef}`
- `server/app.mjs` — `deriveNobookUniqueId()`, `learnerRef` validatsiyasi
- `tests/integration/security-api.test.mjs` — PII rad etilishi, pseudonim formati, barqarorlik (bir o‘quvchi —
  turli laboratoriyalar), ajralish (turli o‘rnatishlar), token/sirlar javobda yo‘qligi
- `tests/p0-external-labs-policy.test.mjs` — installation id barqarorligi
