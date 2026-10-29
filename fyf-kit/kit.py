#!/usr/bin/env python3
"""FEYK YOKI FAKT? — video engine. One JSON in, one finished vertical Short out.

    python3 kit.py episode.json all      # tts + stills + render (default)
    python3 kit.py episode.json tts      # only voice (ElevenLabs, env ELEVEN_KEY, VOICE_ID)
    python3 kit.py episode.json stills   # contact sheet -> <workdir>/sheet.png
    python3 kit.py episode.json render   # MP4 -> episode["out"]

Design system "Toza ekspert — ko'k". Everything (music, SFX) is synthesized; nothing downloaded.
If the voice cannot be made (no key, no credits, network), the video is still rendered with
text-timed beats and music, and kit prints VOICE=OFF so the caller can report it.

episode.json
{
 "ep": "#3", "out": "/home/claude/feyk-yoki-fakt-03.mp4",
 "scenes_dir": "scenes",                       # optional, s<N>.png 1600x2000 light 3D renders
 "ladder": {"steps": [{"icon": "form", "text": "Reklama spami"}, ...], "reverse": false},   # optional
 "beats": [
  {"line": "spoken sentence(s)", "scene": 0, "scene_y": 560, "scene_w": 1080,
   "eyebrow": "TEKSHIRAMIZ",
   "headline": [[["Bu ", 0], ["SMS", 1]], [["haqiqiymi?", 0]]],   # [text, marked]
   "head_size": null, "sub": "muted subline", "sub_cue": "word",
   "grid": [{"icon": "form", "text": "Ism va\\ntelefon", "cue": "Avval"}],     # 2 columns
   "rows": [{"icon": "shield", "text": "Faqat rasmiy manba", "cue": "faqat"}], "rows_color": "green",
   "chip": {"text": "Shubhali havola", "cue": "rostmi"},
   "stamp": {"text": "FEYK", "color": "red", "cue": "firibgarlik"},
   "ladder_upto": 2,                            # show ladder steps 0..2, step 2 is the new one
   "cta": true}                                 # "Obuna bo'ling" + @handle, last beat
 # optional (Instagram version): "handle": "@bh.firdavsiy", "cta_text": "Saqlab qoʻying", "cta_word": "Saqlab"
 ]
}
Icons: form phone money app shield lock card bank clock calendar link search megaphone chat warning
"""
import json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

W, H, FPS, SR = 1080, 1920, 30, 44100
FD = "/usr/share/fonts/opentype/inter/"
_fc = {}
def F(name, size):
    k = (name, int(size))
    if k not in _fc: _fc[k] = ImageFont.truetype(FD + name, int(size))
    return _fc[k]
BLACK = lambda s: F("InterDisplay-Black.otf", s); XB = lambda s: F("InterDisplay-ExtraBold.otf", s)
BOLD = lambda s: F("Inter-Bold.otf", s); IXB = lambda s: F("Inter-ExtraBold.otf", s)
BG = (238, 244, 255); INK = (11, 31, 68); BLUE = (37, 99, 235); TINT = (220, 231, 253)
MARK = (255, 214, 10); RED = (229, 72, 77); RED_T = (253, 232, 233); GREEN = (18, 161, 80)
GREEN_T = (227, 246, 234); MUTED = (90, 106, 140); TRACK = (214, 226, 248); YEL_T = (255, 246, 204); AMBER = (196, 140, 0)
COLORS = {"blue": (BLUE, TINT), "green": (GREEN, GREEN_T), "red": (RED, RED_T), "yellow": (AMBER, YEL_T)}
M = 60; HANDLE = "@bhfirdavsiy"
VO_LEAD, GAP = 0.15, 0.6

def ease(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def appear(lt, d, n=0.42): return ease((lt - d) / n)

# ---------------------------------------------------------------- episode + timing
EPF = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None
E = json.load(open(EPF)) if EPF else {"beats": []}
WD = os.path.dirname(EPF) if EPF else "."
VO = os.path.join(WD, "vo"); os.makedirs(VO, exist_ok=True)
BEATS = E["beats"]; LINES = [b["line"] for b in BEATS]
CMD = sys.argv[2] if len(sys.argv) > 2 else "all"

def tts():
    key, vid = os.environ.get("ELEVEN_KEY"), os.environ.get("VOICE_ID", "RRS8V6m1vyBcJuCxf7mv")
    if not key: print("VOICE=OFF (no ELEVEN_KEY)"); return False
    for i, t in enumerate(LINES):
        body = {"text": "[calm, confident] " + t, "model_id": "eleven_v4", "language_code": "uz",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.85, "style": 0.2, "use_speaker_boost": True}}
        if i: body["previous_text"] = LINES[i - 1]
        if i < len(LINES) - 1: body["next_text"] = LINES[i + 1]
        wv, tx = os.path.join(VO, f"l{i}.wav"), os.path.join(VO, f"l{i}.txt")
        if os.path.exists(wv) and os.path.exists(tx) and open(tx).read() == t: continue   # same line already voiced
        raw = os.path.join(VO, f"raw{i}.mp3")
        r = subprocess.run(["curl", "-s", "-o", raw, "-w", "%{http_code}", "-X", "POST",
                            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128",
                            "-H", f"xi-api-key: {key}", "-H", "Content-Type: application/json", "-d", json.dumps(body)],
                           capture_output=True, text=True)
        if r.stdout != "200":
            msg = open(raw, errors="replace").read()[:200] if os.path.exists(raw) else ""
            print(f"VOICE=OFF (ElevenLabs {r.stdout}: {msg})")
            for k in range(len(LINES)):
                p = os.path.join(VO, f"l{k}.wav")
                if os.path.exists(p): os.remove(p)
            return False
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af",
                        "atempo=1.05,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                        "-ar", "44100", "-ac", "1", os.path.join(VO, f"l{i}.wav")], check=True)
        open(tx, "w").write(t)
    print("VOICE=ON"); return True

def wav_dur(p):
    with wave.open(p) as w: return w.getnframes() / w.getframerate()
def has_voice(): return all(os.path.exists(os.path.join(VO, f"l{i}.wav")) for i in range(len(LINES)))
def vo_len(i):
    p = os.path.join(VO, f"l{i}.wav")
    return wav_dur(p) if os.path.exists(p) else max(2.2, len(LINES[i].split()) * 0.42)

def timing():
    sc, t = [], 0.0
    for i in range(len(LINES)):
        d = vo_len(i) + VO_LEAD + GAP + (0.9 if i == len(LINES) - 1 else 0)
        sc.append((t, t + d)); t += d
    return sc
SC = timing() if LINES else []
DUR = SC[-1][1] if SC else 0
def at_word(i, frag):
    s = LINES[i]; k = s.find(frag) if frag else -1
    if k < 0: k = 0
    return VO_LEAD + (k / max(1, len(s))) * vo_len(i)

# ---------------------------------------------------------------- drawing primitives
def make_bg():
    im = Image.new("RGBA", (W, H), BG + (255,)); deco = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(deco)
    d.ellipse([700, -220, 1300, 380], fill=(37, 99, 235, 26)); d.ellipse([-260, 1350, 300, 1910], fill=(37, 99, 235, 18))
    im.alpha_composite(deco.filter(ImageFilter.GaussianBlur(4))); return im
BGIM = make_bg()
def layer(): return Image.new("RGBA", (W, H), (0, 0, 0, 0))
def comp(im, ly, a, dy=0):
    if a <= 0: return
    if dy: ly = ly.transform(ly.size, Image.AFFINE, (1, 0, 0, 0, 1, -dy))
    if a < 1: ly.putalpha(ly.getchannel("A").point(lambda v: int(v * a)))
    im.alpha_composite(ly)

def lupa(d, x, y, r, col, w):
    d.ellipse([x - r, y - r, x + r, y + r], outline=col, width=w); d.line([x + r * .7, y + r * .7, x + r * 1.6, y + r * 1.6], fill=col, width=w + 2)

def chrome(im, t):
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([M, 70, W - M, 80], 5, fill=TRACK)
    d.rounded_rectangle([M, 70, M + max(10, (W - 2 * M) * t / max(DUR, .1)), 80], 5, fill=BLUE)
    pf = XB(38); label = "FEYK YOKI FAKT?"; lw = d.textlength(label, font=pf)
    d.rounded_rectangle([M, 120, M + 92 + lw + 34, 196], 38, fill=INK)
    lupa(d, 112, 152, 15, MARK, 6); d.text((152, 136), label, font=pf, fill=(255, 255, 255))
    ep = E.get("ep", "")
    if ep:
        ef = XB(40); ew = d.textlength(ep, font=ef)
        d.rounded_rectangle([W - M - ew - 44, 120, W - M, 196], 38, fill=TINT); d.text((W - M - ew - 22, 136), ep, font=ef, fill=BLUE)

def eyebrow(im, text, y, a):
    ly = layer(); ImageDraw.Draw(ly).text((M, y), text, font=XB(44), fill=BLUE); comp(im, ly, a, dy=(1 - a) * 30); return y + 70

def fit_size(lines, maxw, start=150, minimum=90):
    d = ImageDraw.Draw(Image.new("RGB", (8, 8))); s = start
    while s > minimum and not all(sum(d.textlength(t, font=BLACK(s)) for t, _ in ln) <= maxw for ln in lines): s -= 4
    return s

def headline(im, lines, y, a, mark_p, size=None):
    size = size or fit_size(lines, W - 2 * M)
    f = BLACK(size); ly = layer(); d = ImageDraw.Draw(ly); lh = int(size * 1.08)
    for li, ln in enumerate(lines):
        x = M - 4; yy = y + li * lh
        for txt, m in ln:
            w = d.textlength(txt, font=f)
            if m and mark_p > 0:
                lead = len(txt) - len(txt.lstrip()); x2 = x + d.textlength(txt[:lead], font=f)
                tw = d.textlength(txt.strip().rstrip("?.!,"), font=f)
                d.rounded_rectangle([x2 - 6, yy + size * .55, x2 - 6 + (tw + 12) * mark_p, yy + size * 1.08], 8, fill=MARK)
            x += w
        x = M - 4
        for txt, m in ln: d.text((x, yy), txt, font=f, fill=INK); x += d.textlength(txt, font=f)
    comp(im, ly, a, dy=(1 - a) * 36); return y + lh * len(lines)

def wrap(d, text, f, maxw):
    out = []
    for para in text.split("\n"):
        cur = ""
        for w_ in para.split():
            tt = (cur + " " + w_).strip()
            if d.textlength(tt, font=f) <= maxw: cur = tt
            else:
                if cur: out.append(cur)
                cur = w_
        out.append(cur)
    return out

def subline(im, text, y, a, size=46):
    ly = layer(); d = ImageDraw.Draw(ly); f = BOLD(size); lines = wrap(d, text, f, W - 2 * M)
    for i, ln in enumerate(lines): d.text((M, y + i * size * 1.25), ln, font=f, fill=MUTED)
    comp(im, ly, a, dy=(1 - a) * 30); return y + len(lines) * size * 1.25

def card(ly, box, rad=48, fill=(255, 255, 255)):
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ds = ImageDraw.Draw(sh); x0, y0, x1, y1 = box
    ds.rounded_rectangle([x0, y0 + 14, x1, y1 + 14], rad, fill=(11, 31, 68, 40))
    ly.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22))); ImageDraw.Draw(ly).rounded_rectangle(box, rad, fill=fill)

def icon(d, kind, cx, cy, col, s=1.0):
    w = max(2, int(6 * s)); S = lambda v: v * s
    R = lambda x0, y0, x1, y1, r=5: d.rounded_rectangle([cx + S(x0), cy + S(y0), cx + S(x1), cy + S(y1)], r, outline=col, width=w)
    L = lambda *p: d.line([(cx + S(p[k]), cy + S(p[k + 1])) for k in range(0, len(p), 2)], fill=col, width=w, joint="curve")
    if kind == "bank":
        d.polygon([(cx - S(24), cy - S(6)), (cx, cy - S(22)), (cx + S(24), cy - S(6))], outline=col, width=w)
        for k in (-14, 0, 14): L(k, -2, k, 14)
        L(-24, 20, 24, 20)
    elif kind == "form": R(-18, -24, 18, 24); [L(-9, k, 9, k) for k in (-10, 2, 14)]
    elif kind == "phone": R(-14, -24, 14, 24, 6); L(-5, 16, 5, 16)
    elif kind == "money": R(-24, -15, 24, 15); d.ellipse([cx - S(8), cy - S(8), cx + S(8), cy + S(8)], outline=col, width=w - 1)
    elif kind == "app": [R(dx - 8, dy - 8, dx + 8, dy + 8, 3) for dx in (-10, 10) for dy in (-10, 10)]
    elif kind == "shield":
        d.polygon([(cx, cy - S(24)), (cx + S(20), cy - S(14)), (cx + S(16), cy + S(10)), (cx, cy + S(24)), (cx - S(16), cy + S(10)), (cx - S(20), cy - S(14))], outline=col, width=w)
        L(-8, 0, -2, 7, 10, -8)
    elif kind == "lock": R(-18, -4, 18, 22); d.arc([cx - S(12), cy - S(24), cx + S(12), cy + S(8)], 180, 360, fill=col, width=w)
    elif kind == "card": R(-24, -16, 24, 16); L(-24, -5, 24, -5)
    elif kind == "clock": d.ellipse([cx - S(22), cy - S(22), cx + S(22), cy + S(22)], outline=col, width=w); L(0, -12, 0, 0, 10, 6)
    elif kind == "calendar": R(-22, -18, 22, 22); L(-22, -6, 22, -6); L(-10, -26, -10, -12); L(10, -26, 10, -12)
    elif kind == "link":
        d.arc([cx - S(26), cy - S(12), cx + S(2), cy + S(12)], 90, 270, fill=col, width=w); L(-12, -12, -2, -12); L(-12, 12, -2, 12)
        d.arc([cx - S(2), cy - S(12), cx + S(26), cy + S(12)], 270, 90, fill=col, width=w); L(2, -12, 12, -12); L(2, 12, 12, 12)
    elif kind == "search": d.ellipse([cx - S(18), cy - S(18), cx + S(10), cy + S(10)], outline=col, width=w); L(8, 8, 20, 20)
    elif kind == "megaphone":
        d.polygon([(cx - S(20), cy - S(8)), (cx + S(14), cy - S(20)), (cx + S(14), cy + S(20)), (cx - S(20), cy + S(8))], outline=col, width=w); L(-12, 8, -6, 22)
    elif kind == "chat": R(-24, -18, 24, 12, 8); L(-10, 12, -16, 24, -2, 12)
    elif kind == "warning":
        d.polygon([(cx, cy - S(22)), (cx + S(24), cy + S(18)), (cx - S(24), cy + S(18))], outline=col, width=w); L(0, -8, 0, 4); L(0, 10, 0, 12)
    else: d.ellipse([cx - S(18), cy - S(18), cx + S(18), cy + S(18)], outline=col, width=w)

def mini_card(im, x, y, w, h, kind, text, a, col=BLUE, tint=TINT, size=44):
    ly = layer(); card(ly, [x, y, x + w, y + h], 28); d = ImageDraw.Draw(ly)
    d.rounded_rectangle([x + 20, y + (h - 64) // 2, x + 84, y + (h + 64) // 2], 16, fill=tint); icon(d, kind, x + 52, y + h // 2, col, .85)
    f = BOLD(size); lines = wrap(d, text, f, w - 124)
    lh = size * 1.18; y0 = y + h / 2 - lh * len(lines) / 2
    for k, ln in enumerate(lines): d.text((x + 104, y0 + k * lh), ln, font=f, fill=INK)
    comp(im, ly, a, dy=(1 - a) * 30)

def stamp(im, text, color, cx, cy, p):
    if p <= 0: return
    s = 1.5 - 0.5 * ease(p / 0.6) if p < 0.6 else 1.0
    f = BLACK(110 * s); ly = layer(); d = ImageDraw.Draw(ly); w = d.textlength(text, font=f); hh = f.size
    d.rounded_rectangle([cx - w / 2 - 34, cy - hh * .72, cx + w / 2 + 34, cy + hh * .72], 18, fill=(255, 255, 255), outline=color, width=12)
    d.text((cx - w / 2, cy - hh * .62), text, font=f, fill=color)
    comp(im, ly.rotate(7, center=(cx, cy), resample=Image.BICUBIC), min(1, p * 3), dy=int(6 * math.sin(p * 60)) if .55 < p < .75 else 0)

def chip(im, text, y, a, col=RED, tint=RED_T):
    ly = layer(); d = ImageDraw.Draw(ly); f = XB(42); w = d.textlength(text, font=f); x0 = W - M - w - 120
    d.rounded_rectangle([x0, y, W - M, y + 80], 40, fill=tint)
    d.ellipse([x0 + 20, y + 18, x0 + 64, y + 62], fill=col); d.text((x0 + 35, y + 16), "!", font=BLACK(36), fill=(255, 255, 255))
    d.text((x0 + 84, y + 14), text, font=f, fill=col); comp(im, ly, a, dy=(1 - a) * 24)

# ---------------------------------------------------------------- 3D scenes
_SC = {}
def scene_img(n, w):
    k = (n, w)
    if k not in _SC:
        p = os.path.join(WD, E.get("scenes_dir", "scenes"), f"s{n}.png")
        if not os.path.exists(p): _SC[k] = None; return None
        im = Image.open(p).convert("RGBA"); im = im.resize((w, int(w * im.height / im.width)), Image.LANCZOS)
        m = Image.new("L", im.size, 255); dm = ImageDraw.Draw(m)
        for y in range(220): dm.line([0, y, im.width, y], fill=int(255 * (y / 220) ** 1.5))
        im.putalpha(ImageChops.multiply(im.getchannel("A"), m)); _SC[k] = im
    return _SC[k]

def scene(im, n, lt, dur, a, y=560, w=1080):
    src = scene_img(n, w)
    if src is None or a <= 0: return
    z = 1.0 + 0.06 * min(1, lt / max(dur, .1)); ww, hh = int(w * z), int(src.height * z)
    s = src.resize((ww, hh), Image.BILINEAR); ly = layer(); x0 = (W - ww) // 2; y0 = int(y - (hh - src.height) / 2 + (1 - a) * 40)
    ly.alpha_composite(s, (max(0, x0), max(0, y0)), (max(0, -x0), max(0, -y0))); comp(im, ly, a)

# ---------------------------------------------------------------- ladder (ZINAPOYA)
def ladder(im, upto, lt, i):
    L = E.get("ladder") or {}; steps = L.get("steps", []); n = len(steps)
    if not n: return
    rev = L.get("reverse", False)
    top, bot = 700, 1330; cw, ch = 560, 104
    for k in range(min(upto, n - 1) + 1):
        x = M + (W - 2 * M - cw) * (k / max(1, n - 1)); y = bot - (bot - top) * (k / max(1, n - 1)) - ch / 2
        frac = k / max(1, n - 1); danger = (1 - frac) if rev else frac
        col, tint = (RED, RED_T) if danger > .66 else ((AMBER, YEL_T) if danger > .33 else (GREEN, GREEN_T))
        new = k == upto; a = (1.0 if i == 0 else appear(lt, at_word(i, steps[k].get("cue", "")) - .1)) if new else 1.0
        ly = layer(); card(ly, [x, y, x + cw, y + ch], 30); d = ImageDraw.Draw(ly)
        d.rounded_rectangle([x + 18, y + 18, x + 86, y + 86], 16, fill=tint); icon(d, steps[k].get("icon", "warning"), x + 52, y + 52, col, .8)
        fs = 42
        while fs > 28 and d.textlength(steps[k]["text"], font=BOLD(fs)) > cw - 124: fs -= 2
        d.text((x + 104, y + ch / 2 - fs * .62), steps[k]["text"], font=BOLD(fs), fill=INK)
        comp(im, ly, a * (1.0 if new else .6), dy=(1 - a) * 30)
    # danger meter
    ly = layer(); d = ImageDraw.Draw(ly); y0 = 1420
    for xx in range(M, W - M):
        t = (xx - M) / (W - 2 * M); t = 1 - t if rev else t
        c = [int(GREEN[j] + (MARK[j] - GREEN[j]) * t * 2) for j in range(3)] if t < .5 else [int(MARK[j] + (RED[j] - MARK[j]) * (t - .5) * 2) for j in range(3)]
        d.line([xx, y0, xx, y0 + 22], fill=tuple(c))
    mk = Image.new("L", (W, H), 0); ImageDraw.Draw(mk).rounded_rectangle([M, y0, W - M, y0 + 22], 11, fill=255)
    bar = layer(); bar.paste(ly, (0, 0), mk); ly = bar; d = ImageDraw.Draw(ly)
    prev = max(0, upto - 1) / max(1, n - 1); cur = min(upto, n - 1) / max(1, n - 1); p = prev + (cur - prev) * appear(lt, .2, .6)
    kx = M + (W - 2 * M) * p; d.ellipse([kx - 26, y0 - 15, kx + 26, y0 + 37], fill=(255, 255, 255), outline=INK, width=6)
    lo, hi = ("xavfli", "xavfsiz") if rev else ("zararsiz", "xavfli")
    d.text((M, y0 + 46), lo, font=XB(40), fill=RED if rev else GREEN)
    d.text((W - M - d.textlength(hi, font=XB(40)), y0 + 46), hi, font=XB(40), fill=GREEN if rev else RED)
    comp(im, ly, 1)

# ---------------------------------------------------------------- beat renderer
def beat(i, lt, im):
    b = BEATS[i]; dur = SC[i][1] - SC[i][0]; first = i == 0
    A = (lambda d, n=.42: 1.0) if first else (lambda d, n=.42: appear(lt, d, n))
    MP = (lambda d: 1.0) if first else (lambda d: ease((lt - d) / .3))
    if "scene" in b and b["scene"] is not None:
        scene(im, b["scene"], lt, dur, A(.15, .5), y=b.get("scene_y", 560), w=b.get("scene_w", 1080))
    y = 260
    if b.get("eyebrow"): y = eyebrow(im, b["eyebrow"], y, A(0))
    if b.get("headline"):
        y = headline(im, b["headline"], (y + 6) if b.get("eyebrow") else 300, A(.1), MP(.45), size=b.get("head_size"))
    if b.get("sub"): y = subline(im, b["sub"], y + 18, A(at_word(i, b.get("sub_cue")) - .3 if b.get("sub_cue") else .5))
    if b.get("grid"):
        cw, chh, g = (W - 2 * M - 20) // 2, 150, 20
        for k, it in enumerate(b["grid"]):
            x = M + (k % 2) * (cw + g); yy = y + 40 + (k // 2) * (chh + g)
            col, tint = COLORS.get(it.get("color", b.get("grid_color", "blue")))
            mini_card(im, x, yy, cw, chh, it.get("icon", "warning"), it["text"], appear(lt, at_word(i, it.get("cue")) - .1), col, tint)
        y += 40 + ((len(b["grid"]) + 1) // 2) * (chh + g)
    if b.get("rows"):
        col, tint = COLORS.get(b.get("rows_color", "blue"))
        for k, it in enumerate(b["rows"]):
            mini_card(im, M, y + 36 + k * 122, W - 2 * M, 106, it.get("icon", "warning"), it["text"], appear(lt, at_word(i, it.get("cue")) - .1), col, tint)
        y += 36 + len(b["rows"]) * 122
    if "ladder_upto" in b: ladder(im, b["ladder_upto"], lt, i)
    if b.get("chip"): chip(im, b["chip"]["text"], b["chip"].get("y", 1440), appear(lt, at_word(i, b["chip"].get("cue"))))
    if b.get("stamp"):
        st = b["stamp"]; col = {"red": RED, "green": GREEN}.get(st.get("color", "red"), RED)
        dx, dy = ((250, 780) if "ladder_upto" in b else (W / 2, 1180))
        stamp(im, st["text"], col, st.get("x", dx), st.get("y", dy), (lt - at_word(i, st.get("cue"))) / 0.3)
    if b.get("cta"):
        a = appear(lt, at_word(i, E.get("cta_word", "Obuna"))); ly = layer(); d = ImageDraw.Draw(ly); f = XB(56); t1 = E.get("cta_text", "Obuna boʻling"); tw = d.textlength(t1, font=f)
        d.rounded_rectangle([M, y + 40, M + tw + 100, y + 150], 55, fill=BLUE); d.text((M + 50, y + 62), t1, font=f, fill=(255, 255, 255))
        d.text((M + tw + 140, y + 66), E.get("handle", HANDLE), font=XB(48), fill=INK); comp(im, ly, a, dy=(1 - a) * 30)

def frame(t):
    im = BGIM.copy()
    for i, (s, e) in enumerate(SC):
        last = i == len(SC) - 1
        if s - 1e-6 <= t < (e if last else e + 0.25):
            lt = t - s; fo = 1.0 if (t < e or last) else max(0.0, 1 - (t - e) / 0.25)
            ly = layer(); beat(i, lt, ly)
            if fo < 1: ly.putalpha(ly.getchannel("A").point(lambda v: int(v * fo)))
            im.alpha_composite(ly)
    chrome(im, t); return im.convert("RGB")

# ---------------------------------------------------------------- audio
def sfx_events():
    ev = []
    for i, (s, e) in enumerate(SC):
        b = BEATS[i]
        if i: ev.append((s - .12, "whoosh"))
        if b.get("headline") and any(m for ln in b["headline"] for _, m in ln) and i: ev.append((s + .5, "swipe"))
        if i and b.get("scene") is not None: ev.append((s + .3, "ping"))
        for it in (b.get("grid") or []) + (b.get("rows") or []): ev.append((s + at_word(i, it.get("cue")) - .1, "pop"))
        if "ladder_upto" in b:
            st = (E.get("ladder") or {}).get("steps", [])
            if b["ladder_upto"] < len(st): ev.append((s + at_word(i, st[b["ladder_upto"]].get("cue")) - .1, "pop"))
        if b.get("chip"): ev.append((s + at_word(i, b["chip"].get("cue")), "pop"))
        if b.get("stamp"): ev.append((s + at_word(i, b["stamp"].get("cue")), "stamp" if b["stamp"].get("color", "red") == "red" else "ding"))
        if b.get("cta"): ev.append((s + at_word(i, E.get("cta_word", "Obuna")), "pop"))
    ev.sort(); out, last = [], -9
    for tt, k in ev:
        if k in ("stamp", "ding") or tt - last >= .45: out.append((tt, k)); last = tt
    return out

def synth(kind, rng):
    n = lambda sec: int(SR * sec)
    if kind == "whoosh":
        L = n(.38); x = rng.standard_normal(L); x = np.convolve(x, np.ones(18) / 18, "same") - np.convolve(x, np.ones(90) / 90, "same")
        return x * np.sin(np.linspace(0, np.pi, L)) ** 2 * 1.4
    if kind == "pop":
        tt = np.arange(n(.07)) / SR; return np.sin(2 * np.pi * 1400 * tt * (1 - tt * 3)) * np.exp(-tt * 55) * .9
    if kind == "swipe":
        L = n(.25); x = np.convolve(rng.standard_normal(L), np.ones(6) / 6, "same"); return x * np.linspace(0, 1, L) ** .5 * np.exp(-np.linspace(0, 3, L)) * .5
    if kind == "ping":
        out = np.zeros(n(.32))
        for f, st in [(1800, 0), (2400, .09)]:
            tt = np.arange(n(.2)) / SR; s0 = n(st); out[s0:s0 + len(tt)] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 22) * .45
        return out
    if kind in ("stamp", "ding"):
        L = n(.7); tt = np.arange(L) / SR
        out = np.sin(2 * np.pi * (90 * np.exp(-tt * 6) + 55) * tt) * np.exp(-tt * 14) * 1.6
        c = rng.standard_normal(n(.012)); out[:len(c)] += c * .8
        notes = [330, 247] if kind == "stamp" else [1320, 1760]
        for k, f in enumerate(notes):
            s0 = n(.22 + k * .14); e2 = np.arange(n(.18)) / SR
            wave_ = np.sign(np.sin(2 * np.pi * f * e2)) * .16 if kind == "stamp" else np.sin(2 * np.pi * f * e2) * .35
            out[s0:s0 + len(e2)] += wave_ * np.exp(-e2 * 12)
        return out

def music(L):
    tt = np.arange(L) / SR; out = np.zeros(L); beat_ = 60 / 96; bar = beat_ * 4; midi = lambda m: 440 * 2 ** ((m - 69) / 12)
    chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
    for b in range(int(DUR / bar) + 1):
        ch = chords[b % 4]; s0 = int(b * bar * SR); s1 = min(L, int((b + 1) * bar * SR))
        if s0 >= L: break
        x = tt[s0:s1] - b * bar; env = np.minimum(1, x / .6) * np.minimum(1, (bar - x) / .4)
        for m in ch: out[s0:s1] += .05 * env * np.sin(2 * np.pi * midi(m) * x)
        out[s0:s1] += .06 * env * np.sin(2 * np.pi * midi(ch[0] - 12) * x)
        for k in range(8):
            ps = s0 + int(k * beat_ / 2 * SR)
            if ps >= L: break
            ln = min(L - ps, int(.45 * SR)); pt = np.arange(ln) / SR
            out[ps:ps + ln] += .04 * np.exp(-pt * 6) * np.sin(2 * np.pi * midi(ch[[0, 1, 2, 1, 2, 0, 1, 2][k]] + 12) * pt)
        for k in (0, 2):
            ps = s0 + int(k * beat_ * SR); ln = min(L - ps, int(.22 * SR))
            if ln > 0 and b > 0:
                pt = np.arange(ln) / SR; out[ps:ps + ln] += .16 * np.exp(-pt * 18) * np.sin(2 * np.pi * (55 + 80 * np.exp(-pt * 30)) * pt)
    out *= np.minimum(1, tt / 1.0) * np.minimum(1, (DUR - tt) / 1.5); return out / (np.abs(out).max() + 1e-9)

def read_wav(p):
    with wave.open(p) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
        if w.getnchannels() == 2: x = x.reshape(-1, 2).mean(1)
    return x

def build_audio(path):
    L = int(DUR * SR) + SR; voice = np.zeros(L); vo = has_voice()
    if vo:
        for i, (s, _) in enumerate(SC):
            v = read_wav(os.path.join(VO, f"l{i}.wav")); p = int((s + VO_LEAD) * SR); voice[p:p + len(v)] += v[:L - p]
        voice /= (np.sqrt(np.mean(voice[voice != 0] ** 2)) + 1e-9); voice *= 10 ** (-18 / 20)
    speaking = np.convolve(np.abs(voice), np.ones(2205) / 2205, "same") > 10 ** (-40 / 20)
    rng = np.random.default_rng(7); fx = np.zeros(L)
    for tt, k in sfx_events():
        x = synth(k, rng); p = int(tt * SR)
        if 0 <= p < L: fx[p:p + len(x)] += x[:L - p]
    fx = fx / (np.abs(fx).max() + 1e-9) * 10 ** (-14 / 20)
    duck = np.convolve(np.where(speaking, 10 ** (-6 / 20), 1.0), np.ones(1323) / 1323, "same")
    mix = (voice + fx * duck + music(L) * 10 ** ((-27 if vo else -20) / 20))[:int(DUR * SR)]
    raw = path + ".raw.wav"
    with wave.open(raw, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(np.stack([mix, mix], 1), -1, 1) * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89", "-ar", "44100", path], check=True)

def stills():
    times = [0.0]
    for i, (s, e) in enumerate(SC[1:], 1): times.append(e - .05)
    ims = [frame(t) for t in times]
    sheet = Image.new("RGB", (len(ims) * 370, 640), "white")
    for k, im in enumerate(ims): sheet.paste(im.resize((360, 640)), (k * 370, 0))
    p = os.path.join(WD, "sheet.png"); sheet.save(p); print("SHEET", p, "DUR", round(DUR, 2))

def render():
    aud = os.path.join(WD, "mix.wav"); build_audio(aud); out = E.get("out", os.path.join(WD, "out.mp4"))
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-i", aud, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                          "-shortest", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for k in range(int(DUR * FPS)): p.stdin.write(frame(k / FPS).tobytes())
    p.stdin.close(); p.wait()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(round(DUR / 2, 2)), "-i", out, "-frames:v", "1", os.path.join(WD, "mid.png")])
    print("OUT", out, "DUR", round(DUR, 2), "VOICE", "ON" if has_voice() else "OFF")

if __name__ == "__main__":
    if not EPF: print(__doc__); sys.exit(1)
    if CMD in ("tts", "all"):
        if not has_voice() or os.environ.get("ELEVEN_KEY"): tts()   # tts() skips lines already voiced
        SC = timing(); DUR = SC[-1][1]
    if CMD in ("stills", "all"): stills()
    if CMD in ("render", "all"): render()
