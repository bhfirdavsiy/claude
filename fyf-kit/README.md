# FEYK YOKI FAKT? — video engine

Used by the scheduled "Feyk yoki fakt Shorts" runs for @bhfirdavsiy (YouTube) and @bh.firdavsiy (Instagram).

- `kit.py` — explainer Shorts from `episode.json` (voice via ElevenLabs, light-blue design, synthesized music and SFX).
  Instagram version: same episode with `"handle": "@bh.firdavsiy"`, `"cta_text": "Saqlab qoʻying"`, `"cta_word": "Saqlab"`
  and the last line "Saqlab qoʻying va doʻstingizga yuboring!" (see `example-ig-episode.json`). Voiced lines are reused.
- `clip.py` — vertical clips from old long videos, captions only for Bahodir's own speech (`"speaker"`), optional `"handle"`.
- `../ig-videos/` — Instagram versions, served to vidIQ through raw.githubusercontent.com.
