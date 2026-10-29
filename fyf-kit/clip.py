#!/usr/bin/env python3
"""FEYK YOKI FAKT? — clip engine: cut a moment from an old long video into a vertical Short.

    python3 clip.py clip.json

clip.json
{"src": "src/v1.mp4", "words": "src/part.json", "words_offset": 120,
 "start": 231.75, "end": 260.85, "out": "/home/claude/klip-01.mp4",
 "eyebrow": "TOʻLIQ VIDEODAN",
 "headline": [[["Feyk ", 0], ["millionga", 1]], [["yetadi. Raddiya-chi?", 0]]],
 "footer": "Toʻliq suhbat — kanalda",
 "fix": {"fake": "feyk"}}
words: ElevenLabs speech-to-text JSON (word timestamps); words_offset = where that transcript starts in src.
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
FD = "/usr/share/fonts/opentype/inter/"
def F(n, s): return ImageFont.truetype(FD + n, int(s))
BG = (238, 244, 255); INK = (11, 31, 68); BLUE = (37, 99, 235); TINT = (220, 231, 253)
MARK = (255, 214, 10); MUTED = (90, 106, 140); TRACK = (214, 226, 248); WHITE = (255, 255, 255)
M = 60; HANDLE = "@bhfirdavsiy"

C = json.load(open(sys.argv[1])); WD = os.path.dirname(os.path.abspath(sys.argv[1]))
P = lambda p: p if os.path.isabs(p) else os.path.join(WD, p)
S, E_ = C["start"], C["end"]; DUR = E_ - S; N = int(DUR * FPS)
VW, VH = 960, 540; VX, VY = 60, 720

# ---- words in clip, relative time
raw = json.load(open(P(C["words"])))["words"]; off = C.get("words_offset", 0); fix = C.get("fix", {})
CYR = dict(zip("абвгджзийклмнопрстуфхцчшщъьэюяўқғҳё",
               ["a","b","v","g","d","j","z","i","y","k","l","m","n","o","p","r","s","t","u","f","x","s","ch","sh","sh","ʼ","","e","yu","ya","oʻ","q","gʻ","h","yo"]))
def latin(t):
    out = []
    for i, ch in enumerate(t):
        lo = ch.lower()
        if lo == "е": r = "ye" if i == 0 or not t[i - 1].isalpha() else "e"
        elif lo in CYR: r = CYR[lo]
        else: out.append(ch); continue
        out.append(r.capitalize() if ch != lo and r else r)
    return "".join(out)
SPK = C.get("speaker")   # keep only this speaker's words in captions
words = []
for w in raw:
    if w.get("type") != "word": continue
    if SPK and w.get("speaker_id") != SPK: continue
    a, b = w["start"] + off - S, w["end"] + off - S
    if b <= 0 or a >= DUR: continue
    t = latin(w["text"])
    for k, v in fix.items(): t = t.replace(k, v)
    words.append((max(0, a), min(DUR, b), t))
# groups of up to 4 words, break on sentence end or pause
groups, cur = [], []
for i, w in enumerate(words):
    cur.append(w)
    nxt = words[i + 1] if i + 1 < len(words) else None
    if len(cur) == 4 or w[2][-1] in ".,?!" or nxt is None or nxt[0] - w[1] > 0.5:
        groups.append(cur); cur = []

# ---- static base
def base():
    im = Image.new("RGBA", (W, H), BG + (255,))
    deco = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(deco)
    dd.ellipse([700, -220, 1300, 380], fill=(37, 99, 235, 26)); dd.ellipse([-260, 1350, 300, 1910], fill=(37, 99, 235, 18))
    im.alpha_composite(deco); d = ImageDraw.Draw(im)
    pf = F("InterDisplay-ExtraBold.otf", 38); lab = "FEYK YOKI FAKT?"; lw = d.textlength(lab, font=pf)
    d.rounded_rectangle([M, 120, M + 92 + lw + 34, 196], 38, fill=INK)
    d.ellipse([112 - 15, 152 - 15, 112 + 15, 152 + 15], outline=MARK, width=6); d.line([122, 162, 136, 176], fill=MARK, width=8)
    d.text((152, 136), lab, font=pf, fill=WHITE)
    tf = F("InterDisplay-ExtraBold.otf", 40); tag = "KLIP"; tw = d.textlength(tag, font=tf)
    d.rounded_rectangle([W - M - tw - 44, 120, W - M, 196], 38, fill=TINT); d.text((W - M - tw - 22, 136), tag, font=tf, fill=BLUE)
    d.text((M, 278), C.get("eyebrow", "TOʻLIQ VIDEODAN"), font=F("InterDisplay-ExtraBold.otf", 44), fill=BLUE)
    hf = F("InterDisplay-Black.otf", C.get("head_size", 104)); y = 340
    for line in C["headline"]:
        x = M
        for t, m in line:
            w = d.textlength(t, font=hf)
            if m: d.rounded_rectangle([x - 6, y + hf.size * 0.55, x + w + 6, y + hf.size * 1.08], 6, fill=MARK)
            x += w
        x = M
        for t, m in line: d.text((x, y), t, font=hf, fill=INK); x += d.textlength(t, font=hf)
        y += int(hf.size * 1.12)
    # card with shadow
    box = [VX - 20, VY - 20, VX + VW + 20, VY + VH + 20]
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([box[0], box[1] + 14, box[2], box[3] + 14], 44, fill=(11, 31, 68, 45))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22))); d = ImageDraw.Draw(im)
    d.rounded_rectangle(box, 44, fill=WHITE)
    ff = F("InterDisplay-ExtraBold.otf", 40); ft = C.get("footer", "Toʻliq suhbat — kanalda"); fw = d.textlength(ft, font=ff)
    d.rounded_rectangle([(W - fw) / 2 - 36, 1600, (W + fw) / 2 + 36, 1680], 40, fill=BLUE); d.text(((W - fw) / 2, 1614), ft, font=ff, fill=WHITE)
    hf2 = F("Inter-Bold.otf", 38); hd = C.get("handle", HANDLE); hw = d.textlength(hd, font=hf2); d.text(((W - hw) / 2, 1704), hd, font=hf2, fill=MUTED)
    return im

B = np.array(base().convert("RGB"))
mask = Image.new("L", (VW, VH), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, VW, VH], 28, fill=255)
MK = (np.array(mask)[..., None] / 255.0).astype(np.float32)

CAP_Y, CAP_H = 1300, 270
cf = F("InterDisplay-Black.otf", 66)
def caption(gi, wi):
    im = Image.fromarray(B[CAP_Y:CAP_Y + CAP_H].copy()); d = ImageDraw.Draw(im)
    g = groups[gi]; toks = [w[2] for w in g]; sp = d.textlength(" ", font=cf)
    lines, cur, cw = [], [], 0
    for k, t in enumerate(toks):
        tw = d.textlength(t, font=cf)
        if cur and cw + sp + tw > W - 2 * M: lines.append(cur); cur, cw = [], 0
        cur.append((k, t)); cw += (sp if cw else 0) + tw
    lines.append(cur)
    y = (CAP_H - len(lines) * 84) / 2
    for ln in lines:
        lw = sum(d.textlength(t, font=cf) for _, t in ln) + sp * (len(ln) - 1); x = (W - lw) / 2
        for k, t in ln:
            tw = d.textlength(t, font=cf)
            if k == wi: d.rounded_rectangle([x - 8, y + 6, x + tw + 8, y + 82], 12, fill=MARK)
            d.text((x, y), t, font=cf, fill=INK if k <= wi else (150, 162, 190)); x += tw + sp
        y += 84
    return np.array(im)

def active(t):
    for gi, g in enumerate(groups):
        if g[0][0] - 0.05 <= t < (groups[gi + 1][0][0] - 0.05 if gi + 1 < len(groups) else DUR + 1):
            wi = 0
            for k, w in enumerate(g):
                if t >= w[0] - 0.05: wi = k
            return gi, wi
    return None

dec = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", str(S), "-t", str(DUR), "-i", P(C["src"]),
                        "-vf", f"scale={VW}:{VH}:force_original_aspect_ratio=increase,crop={VW}:{VH},fps={FPS}",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
aud = os.path.join(WD, "clip_audio.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(S), "-t", str(DUR), "-i", P(C["src"]), "-vn",
                "-af", "afade=t=in:d=0.15,afade=t=out:st=%.2f:d=0.4,loudnorm=I=-14:TP=-1.5" % (DUR - 0.4),
                "-ar", "44100", "-ac", "2", aud], check=True)
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                        "-i", "-", "-i", aud, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", C["out"]], stdin=subprocess.PIPE)
cache = {}; last = None
for i in range(N):
    buf = dec.stdout.read(VW * VH * 3)
    if len(buf) < VW * VH * 3:
        if last is None: break
        v = last
    else: v = np.frombuffer(buf, np.uint8).reshape(VH, VW, 3); last = v
    fr = B.copy(); t = i / FPS
    reg = fr[VY:VY + VH, VX:VX + VW].astype(np.float32)
    fr[VY:VY + VH, VX:VX + VW] = (v * MK + reg * (1 - MK)).astype(np.uint8)
    a = active(t)
    if a:
        if a not in cache: cache = {a: caption(*a)}
        fr[CAP_Y:CAP_Y + CAP_H] = cache[a]
    p = int((W - 2 * M) * (t / DUR))
    fr[70:80, M:W - M] = TRACK; fr[70:80, M:M + max(p, 10)] = BLUE
    enc.stdin.write(fr.tobytes())
    if i == int(N * 0.4): Image.fromarray(fr).save(os.path.join(WD, "clip_mid.png"))
enc.stdin.close(); enc.wait(); dec.kill(); dec.wait()
print("OUT", C["out"], "DUR %.2f" % DUR, "WORDS", len(words))
