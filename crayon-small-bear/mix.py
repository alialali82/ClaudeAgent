"""Little Bear and the White Crayon — ukulele, toy piano, music box, clarinet, recorder, crayon / page-turn foley, voice → out/mix.wav"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from synth import *
sys.path.insert(0, os.path.join(LIB, 'core', 'audio'))
import pluck as PL
ev = json.load(open(os.path.join(HERE, 'events.json'))); DUR = ev['dur']; EV = ev['ev']; rng = np.random.default_rng(21)
E8 = 60 / 84 / 3; BAR = E8 * 6          # 6/8 at dotted-quarter = 84
M = Mix(DUR); S = Mix(DUR); A = Mix(DUR)
def uke(m, at, d=.5, v=.5, pan=-.15): M.put(PL.pluck('nylon_guitar', m, d, vel=v), at, 1, pan)
def toy(m, at, v=.5, pan=.2): M.put(PL.pluck('kalimba', m, None, vel=v), at, 1, pan)
def mbox(m, at, v=.5, droop=0.0, pan=.1):
    x = PL.pluck('music_box', m, None, vel=v)
    if droop: n = len(x); k = 1 - droop * np.linspace(0, 1, n); idx = np.cumsum(k); idx = idx / idx[-1] * (n - 1); x = np.interp(idx, np.arange(n), x).astype(np.float32)
    M.put(x, at, 1, pan)
def clar(m, at, d, v=.4, pan=0):
    n = int((d + .3) * SR); t = np.arange(n) / SR; f = mtof(m) * (1 + .004 * np.sin(2 * np.pi * 4.6 * t) * np.clip(t, 0, 1)); ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + .38 * np.sin(3 * ph) + .2 * np.sin(5 * ph) + .08 * np.sin(7 * ph); y += bp(noise(d + .3), 900, 3000, 2)[:n] * .04
    e = np.minimum(1, t / .08) * np.where(t < d, 1, np.clip(1 - (t - d) / .3, 0, 1)); M.put((y * e * v * .5).astype(np.float32), at, 1, pan)
def recorder(m, at, d, v=.4, pan=.05):
    n = int((d + .2) * SR); t = np.arange(n) / SR; f = mtof(m) * (1 + .005 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / .5, 0, 1)); ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + .1 * np.sin(2 * ph) + .03 * np.sin(3 * ph); y += hp(noise(d + .2), 3000, 1)[:n] * .02
    e = np.minimum(1, t / .05) * np.where(t < d, 1, np.clip(1 - (t - d) / .2, 0, 1)); M.put((y * e * v * .5).astype(np.float32), at, 1, pan)
def woodblock(at, v=.3): t = t_(.1); M.put((np.sin(2 * np.pi * 1000 * t) * np.exp(-t / .018) * v).astype(np.float32), at, 1, .3)
def shaker(at, v=.12): t = t_(.1); M.put((hp(noise(.1), 5000, 1) * np.sin(np.pi * np.clip(t / .1, 0, 1)) * v).astype(np.float32), at, 1, -.3)
CH = {'C': (48, [60, 64, 67]), 'Am': (45, [57, 60, 64]), 'F': (41, [57, 60, 65]), 'G': (43, [55, 59, 62]), 'Dm': (50, [57, 62, 65]), 'Em': (40, [55, 59, 64])}
def strum(ch, t0, v=.45):
    root, tri = CH[ch]; uke(root + 12, t0, .5, v); [uke(m, t0 + .012 * (i + 1), .4, v * .7) for i, m in enumerate(tri)]
def ukebar(ch, t0, v=.45, on=(0, 3)):
    for e in on: strum(ch, t0 + e * E8, v if e == 0 else v * .8)
pent = [72, 74, 76, 79, 81, 84, 86, 88, 91]

# ---- page 1: dusk (0 .. 18)
for i, ch in enumerate(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Am']): ukebar(ch, 3.2 + i * BAR, .3 + .02 * (i > 3))     # the day, light and easy
for i, (m, t) in enumerate([(76, 7.4), (79, 8.9), (81, 10.2)]): toy(m, t, .4)
clar(45, 11.6, 3.4, .35); clar(41, 15.2, 2.8, .4)                                      # the cave is mentioned: a low clarinet
for i, (m, t) in enumerate([(81, 13.2), (79, 14.6), (76, 15.8), (74, 16.8), (72, 17.6)]): mbox(m, t, .4, droop=.25 + .12 * i)
# ---- page 2: night, one step at a time (19.3 .. 37.4)
clar(45, 19.8, 5.0, .3); M.put(PL.pluck('upright_bass_pizz', 33, None, vel=.5), 20.4, 1, 0)
for t in np.arange(20.5, 23.2, .9): M.put(PL.pluck('upright_bass_pizz', 33, None, vel=.35), float(t), 1, 0)       # a heartbeat of a bass note
for i, ch in enumerate(['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'C']): ukebar(ch, 24.0 + i * BAR, .26 + .02 * i, (0, 3) if i < 5 else (0, 2, 3, 5))
for t in np.arange(26.0, 37.0, E8 * 3): shaker(float(t), .08); woodblock(float(t) + E8 * 1.5, .1)
recorder(76, 33.0, .6, .28); recorder(79, 33.7, 1.2, .3); recorder(81, 35.6, 1.4, .3)
# ---- page 3: the clearing, the theme once in full (38.6 .. 50)
theme = [(0, 76, 3), (3, 79, 3), (6, 81, 2), (8, 79, 1), (9, 76, 3), (12, 74, 3), (15, 76, 2), (17, 72, 1), (18, 72, 6), (24, 76, 3), (27, 79, 3), (30, 84, 3), (33, 81, 2), (35, 79, 1), (36, 76, 4), (40, 74, 1), (41, 72, 1), (42, 72, 6)]
for e, m, d in theme: recorder(m, 40.0 + e * E8, d * E8 * .95, .42)
for i, ch in enumerate(['C', 'Am', 'F', 'C', 'C', 'F', 'G', 'C']): ukebar(ch, 38.8 + i * BAR, .42, (0, 2, 3, 5)); clar(CH[ch][0] + 12, 38.8 + i * BAR, BAR * .9, .2)
for i in range(8): shaker(38.8 + i * BAR + 3 * E8, .09); woodblock(38.8 + i * BAR + 3 * E8, .14)
# ---- the fridge: the music box slows to a stop
for i, (m, t, dr) in enumerate([(84, 50.4, 0), (79, 51.6, .05), (76, 52.8, .1), (72, 54.4, .2), (67, 56.2, .4), (60, 57.4, .5)]): mbox(m, t, .4, droop=dr)

# ---- foley
def cstroke(d=.45, v=.3): t = t_(d); n = bp(noise(d), 1500, 6500, 2) * (.55 + .45 * np.abs(np.sin(2 * np.pi * 26 * t))) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** .6; return (n * v).astype(np.float32)
def swish(d=.5, v=.25): t = t_(d); n = bp(noise(d), 1000, 4500, 2) * (.5 + .5 * np.sin(2 * np.pi * 4 * t)) * np.sin(np.pi * t / d); return (n * v).astype(np.float32)
def felt(v=.4): t = t_(.12); return (lp(noise(.12), 320, 2) * np.exp(-t / .03) * v * 3 + np.sin(2 * np.pi * 90 * t) * np.exp(-t / .04) * v * .5).astype(np.float32)
def pageturn(d):
    t = t_(d + .3); w = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.2; y = bp(noise(d + .3), 500, 3500, 2) * w * .7 + lp(noise(d + .3), 200, 2) * w * .5
    k = int((d * .9) * SR); y[k:k + int(.12 * SR)] += lp(noise(.12), 400, 2) * np.exp(-t_(.12) / .03) * .6; return y.astype(np.float32) * .6
for e in EV:
    t = e['t']; k = e['type']
    if k == 'cstroke': S.put(cstroke(.4, .3), t, 1, rng.uniform(-.3, .3))
    elif k == 'swish': S.put(swish(), t, 1, rng.uniform(-.3, .3))
    elif k == 'scribble': S.put(cstroke(.25, .22 + .1 * ((t - 11) / 7)), t, 1, .4)
    elif k == 'steps':
        tt = t
        while tt < t + e['d']: S.put(felt(), tt, 1, rng.uniform(-.1, .1)); tt += .3
    elif k == 'rustle': S.put(swish(.4, .3), t, 1, 0)
    elif k == 'turn': S.put(pageturn(e['d']), t, 1, 0)
    elif k == 'light':
        j = int(rng.integers(0, len(pent))); M.put(glock(pent[j], .45), t, 1, e['pan'] * .6); S.put(cstroke(.3, .18), t - .1, 1, e['pan'] * .5)
    elif k == 'burst': M.put(glock(pent[int(rng.integers(0, len(pent)))] + 12 * int(rng.integers(0, 2)) , .35), t, 1, rng.uniform(-.7, .7))
    elif k == 'whoosh': S.put((bp(noise(1.2), 400, 6000, 2) * np.sin(np.pi * t_(1.2) / 1.2) ** 2 * .3).astype(np.float32), t, 1, 0)
    elif k == 'slide': S.put((lp(noise(1.0), 500, 2) * np.sin(np.pi * t_(1.0) / 1.0) * .4).astype(np.float32), t, 1, 0)
    elif k == 'tape': S.put((hp(noise(.5), 2500, 1) * np.sin(np.pi * t_(.5) / .5) ** .6 * .12).astype(np.float32), t, 1, 0)
def clk(at): t = t_(.05); S.put((np.sin(2 * np.pi * 1800 * t) * np.exp(-t / .006) * .08).astype(np.float32), at, 1, -.4)
for t0 in np.arange(51.0, 60, 1.0): clk(float(t0))

# ---- ambience: dusk birds & room, the held breath of the cave, night crickets, the fridge hum
tg = np.arange(A.n) / SR
def bed(x, a, b, fi=1.5, fo=1.5, g=1.0):
    n = len(x); t = np.arange(n) / SR; env = np.clip((t - a) / fi, 0, 1) * np.clip((b - t) / fo, 0, 1) * ((t >= a) & (t <= b)); return (x * env * g).astype(np.float32)
nn = lambda: noise(A.n / SR)
for pan in (-.2, .2):
    A.put(bed(lp(nn(), 260, 1), 0, 18, 1, 1, .05) + bed(lp(nn(), 300, 1), 19.3, 37.4, 1, 1, .04) + bed(lp(nn(), 260, 1), 38.6, 49, 1, 2, .05), 0, 1, pan)
    A.put(bed(lp(nn(), 120, 1), 49, 60, 2, 2, .09), 0, 1, pan)        # fridge hum
def cricket(at, v=.05, f=4400):
    t = t_(.4); pulses = (np.sin(2 * np.pi * 14 * t) > .4) * np.exp(-t / .3); A.put((np.sin(2 * np.pi * f * t) * pulses * v).astype(np.float32), at, 1, rng.uniform(-.8, .8))
for t0 in np.arange(1.0, 16.0, 1.4): cricket(float(t0), .02)
for t0 in np.arange(24.0, 37.0, 1.1): cricket(float(t0), .03 + .002 * (t0 - 24), 4200 + rng.uniform(-200, 300))
for t0 in np.arange(40.0, 49.0, .8): cricket(float(t0), .05, 4300 + rng.uniform(-200, 300))

# ---- voice + mix
cues = [e for e in EV if e['type'] == 'voice']
V = voice_track(M, None, os.path.join(HERE, 'out', 'voice'), cues, gain=1.0, comp_thr=.18)
vm = V.L + V.R; gd = duck(vm, depth=.5, att=.05, rel=.6); ga = duck(vm, depth=.2, att=.1, rel=.8)
mus = reverb(M.stereo() * gd[:, None], rt=.9, wet=.2); sfxb = S.stereo(); amb = A.stereo() * ga[:, None]
vox = reverb(V.stereo(), rt=.5, wet=.06)
sp = vm ** 2 > 1e-6
def rms(x, m): return np.sqrt(np.mean(x[m] ** 2)) + 1e-9
k_m = rms(vox[:, 0], sp) / rms(mus[:, 0], sp) * 10 ** (-10 / 20)
mix = vox + mus * k_m + sfxb * 1.0 + amb * .9
mix = np.stack([sfx.limit(mix[:, 0], .72), sfx.limit(mix[:, 1], .72)], 1)
write(os.path.join(HERE, 'out', 'mix.wav'), mix[:int((DUR + .5) * SR)])
print('mix written; music gain', round(float(k_m), 3))
