# FEYK YOKI FAKT? — video engine

Used by the scheduled "Feyk yoki fakt Shorts" runs for @bhfirdavsiy (YouTube) and @bh.firdavsiy (Instagram).

- `kit.py` — explainer Shorts from `episode.json` (voice via ElevenLabs, light-blue design, synthesized music and SFX).
  Instagram version: same episode with `"handle": "@bh.firdavsiy"`, `"cta_text": "Saqlab qoʻying"`, `"cta_word": "Saqlab"`
  and the last line "Saqlab qoʻying va doʻstingizga yuboring!" (see `example-ig-episode.json`). Voiced lines are reused.
- `clip.py` — vertical clips from old long videos, captions only for Bahodir's own speech (`"speaker"`), optional `"handle"`.
- `../ig-videos/` — Instagram versions, served to vidIQ through raw.githubusercontent.com.

## Retention rules (from Instagram insights, 2026-10-30: half of viewers left in the first second, 80% by 3–4 s)
- Beat 0 must move in the first second: kit pulses beat 0 and pops its `chip` at 0.35 s — always give beat 0 a short red `chip`.
- First spoken line ≤ 8 words, concrete, no intro ("Salom", "Bugun gaplashamiz" are banned).
- Instagram cut: 3–4 beats only (hook → the one key fact → what to do → CTA), 20–30 s. `example-ig-episode.json` is the model.
- YouTube version may keep 5–7 beats but stays ≤ 45 s.
