"""The Long Way Home — score, foley, ambience, voice → out/mix.wav (48 kHz stereo)."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from synth import *

ev = json.load(open(os.path.join(HERE, 'events.json')))
DUR = ev['dur']; EV = ev['ev']; rng = np.random.default_rng(5)
BEAT = 60 / 72; BAR = 4 * BEAT

# ---------------------------------------------------------------- music
M = Mix(DUR)
def P(m, at, d=1.6, v=.7, pan=0): M.put(piano(m, d, v), at, 1, pan)
def K(m, at, v=.6, pan=.2): M.put(kalimba(m, v), at, 1, pan)
def G(m, at, v=.5, pan=-.2): M.put(glock(m, v), at, 1, pan)
def PAD(ms, at, d, v=.4):
    for m in ms: M.put(pad(m, d, v), at, 1, 0)

# A — blank paper: one felt note, a few kalimba drops
P(57, .6, 3.0, .5); K(76, 2.6, .45); K(72, 4.3, .4); K(69, 6.0, .4)
# B — street in the rain (A minor), a slow quarter-note arpeggio and a thin kalimba tune
chords = [(45, [57, 60, 64]), (41, [53, 57, 60]), (48, [55, 60, 64]), (43, [55, 59, 62])]
for bar in range(4):
    t0 = 7.0 + bar * BAR; root, tri = chords[bar % 4]
    M.put(softbass(root, BAR * .95, .45), t0, 1, 0)
    for i, m in enumerate([tri[0], tri[1], tri[2], tri[1]]): P(m, t0 + i * BEAT, 1.2, .5 + .06 * (i == 0))
tune = [(76, 8.0), (72, 9.7), (69, 11.3), (72, 13.7), (74, 15.4), (71, 17.0), (69, 18.7)]
for m, t in tune: K(m, t, .55)
# C — the bridge (dusk): strings enter low and slow, the piano thins to single notes
for t0, ch in [(20.0, [50, 53, 57]), (23.3, [45, 52, 57]), (26.7, [46, 53, 58]), (30.0, [45, 52, 57])]:
    PAD(ch, t0, BAR * 1.05, .32)
for i, (m, t) in enumerate([(69, 20.4), (65, 22.1), (62, 24.6), (64, 26.4), (60, 28.9), (57, 30.4)]): P(m, t, 2.6, .42)
M.put(softbass(33, 6.5, .5), 21.0, 1, 0); M.put(softbass(33, 7.5, .45), 27.0, 1, 0)
P(45, 32.1, 3.5, .38)                                    # the last note before the mist; then nothing
# E — a warm smell (C major), piano returns first, then glockenspiel
chords2 = [(48, [60, 64, 67, 72]), (41, [60, 65, 69, 72]), (43, [59, 62, 67, 71]), (48, [60, 64, 67, 72]), (45, [57, 60, 64, 69]), (41, [60, 65, 69, 72]), (43, [59, 62, 67, 71]), (48, [60, 64, 67, 72])]
t0 = 41.4
P(60, t0, 2.4, .55); P(64, t0 + .0, 2.4, .45); P(67, t0 + .0, 2.4, .4)       # first sound after the silence
for bar in range(1, 4):
    tb = 41.4 + bar * BAR; root, ch = chords2[bar]
    M.put(softbass(root, BAR * .95, .5), tb, 1, 0)
    for i, m in enumerate(ch): P(m, tb + i * BEAT * .5 * 2 / 1.0 * .5 * 2 if False else tb + i * BEAT, 1.3, .5)
for m, t in [(79, 44.2), (76, 45.0), (79, 45.8), (84, 47.0), (83, 48.2), (79, 49.0), (76, 50.0), (79, 51.0)]: G(m, t, .5)
for i in range(3): K([72, 76, 79][i], 42.0 + i * .6, .4)
# F — the door: one warm chord held, the music steps back for the tag
for m in [48, 55, 59, 62, 67]: M.put(pad(m, 8.0, .36, att=1.8, rel=2.0), 52.0, 1, 0)
for m, t in [(72, 53.0), (67, 54.4), (64, 55.2)]: P(m, t, 2.4, .5)
P(60, 58.2, 3.0, .45); G(84, 58.9, .4)

# ---------------------------------------------------------------- foley
F = Mix(DUR)
def step(surf, g):
    d = .09; n = noise(d); e = np.exp(-t_(d) / .016)
    if surf in ('stone', 'wet'): y = bp(n, 400, 2600, 2) * e * .5 + np.sin(2 * np.pi * 85 * t_(d)) * np.exp(-t_(d) / .03) * .35
    elif surf == 'boards': y = np.sin(2 * np.pi * 150 * t_(d)) * np.exp(-t_(d) / .045) * .6 + lp(n, 900, 2) * e * .4
    else: y = lp(n, 520, 2) * np.exp(-t_(d) / .022) * .8 + np.sin(2 * np.pi * 70 * t_(d)) * np.exp(-t_(d) / .03) * .2
    return (y * g).astype(np.float32)
def brush(g=1.0):
    d = .55; t = t_(d); n = bp(noise(d), 1500, 6500, 2) * np.sin(np.pi * t / d) ** 1.5 * (1 + .35 * np.sin(2 * np.pi * 27 * t)); return (n * g * .5).astype(np.float32)
def pencil(g=1.0):
    d = .45; t = t_(d); n = bp(noise(d), 3200, 8500, 2) * np.abs(np.sin(2 * np.pi * 13 * t)) ** 1.4 * np.sin(np.pi * t / d); return (n * g * .35).astype(np.float32)
def mistsnd():
    d = 4.0; t = t_(d); n = bp(noise(d), 500, 3200, 2) * np.sin(np.pi * t / d) ** 2 * (1 + .2 * np.sin(2 * np.pi * .7 * t)); return (n * .22).astype(np.float32)
def tag():
    out = np.zeros(int(2.2 * SR), np.float32)
    for off, g in [(0, 1.0), (.17, .45)]:
        y = tone(1.0, .05, [(2930, 1, 1), (4390, .5, .6), (6150, .22, .4), (8100, .08, .3)], .75, att=.0008, rel=.8)
        out[int(off * SR):int(off * SR) + len(y)] += y[:len(out) - int(off * SR)] * g
    return out
for e in EV:
    t = e['t']
    if e['type'] == 'step': F.put(step(e['surf'], e['gain'] * (.55 if t < 36 else .5)), t, 1, rng.uniform(-.1, .1))
    elif e['type'] == 'brush': F.put(brush(e['gain']), t, 1, e.get('pan', 0) * .6)
    elif e['type'] == 'pencil': F.put(pencil(.9), t, 1, rng.uniform(-.3, .3))
    elif e['type'] == 'mist': F.put(mistsnd(), t, 1, 0)
    elif e['type'] == 'latch': F.put(sfx.click(.8) * .5 if hasattr(sfx, 'click') else brush(.2), t, 1, .15); F.put(step('boards', 1.0) * .6, t + .12, 1, .15)
    elif e['type'] == 'tag': F.put(tag(), t, .55, .1)

# ---------------------------------------------------------------- ambience
A = Mix(DUR)
def bed(x, a, b, fi=1.5, fo=1.5, g=1.0):
    n = len(x); t = np.arange(n) / SR; env = np.clip((t - a) / fi, 0, 1) * np.clip((b - t) / fo, 0, 1) * ((t >= a) & (t <= b)); return (x * env * g).astype(np.float32)
nn = lambda: noise(DUR + 2)
for ch, pan in ((0, -.2), (1, .2)):
    b = np.zeros(A.n, np.float32)
    b += bed(bp(nn(), 1800, 9000, 2), 7.5, 32.5, 2.5, 2.0, .11) * 1.0
    b += bed(lp(sfx.brown(DUR + 2) if hasattr(sfx, 'brown') else nn(), 700, 2), 19.5, 33.0, 2.0, 2.5, .6) * .5
    b += bed(bp(nn(), 300, 1200, 2) * (1 + .6 * np.sin(2 * np.pi * 3.1 * np.arange(A.n) / SR)), 8.5, 19.5, 2.0, 2.0, .035)
    b += bed(bp(nn(), 90, 400, 1), 0.0, 32.5, .5, 1.5, .02)
    b += bed(lp(nn(), 700, 1), 41.0, 60.0, 2.0, 2.5, .06 * (1 + .5 * np.sin(2 * np.pi * .13 * np.arange(A.n) / SR)))
    b += bed(bp(nn(), 120, 600, 1), 53.0, 62.0, 2.0, 2.0, .05)
    A.put(b, 0, 1, pan)
for t in np.sort(rng.uniform(14, 31, 22)): A.put((sfx.pop(.4) if hasattr(sfx, 'pop') else step('stone', .3)) * .25, float(t), 1, rng.uniform(-.7, .7))
def chirp(f0, f1, d=.12):
    t = t_(d); ph = 2 * np.pi * (f0 * t + (f1 - f0) * t ** 2 / (2 * d)); return (np.sin(ph) * np.sin(np.pi * t / d) ** 2).astype(np.float32)
for base in (42.6, 46.1, 49.4, 51.0):
    for i in range(3 + int(rng.integers(0, 3))): A.put(chirp(rng.uniform(2600, 3600), rng.uniform(3600, 4800)) * .06, base + i * .17, 1, rng.uniform(-.8, .8))
A.put(tone(1, .1, [(1180, 1, 1), (2360, .4, .5)], .9, rel=1.4) * .02, 32.0, 1, 0)

# ---------------------------------------------------------------- voice + mix
cues = [e for e in EV if e['type'] == 'voice']
V = voice_track(M, None, os.path.join(HERE, 'out', 'voice'), cues, gain=1.0)
vm = V.L + V.R
g_duck = duck(vm, depth=.5, att=.06, rel=.7)
g_amb = duck(vm, depth=.25, att=.1, rel=.8)
# step back for the tag clink
tt = np.arange(M.n) / SR; tagdip = 1 - .55 * (np.clip((tt - 55.9) / .3, 0, 1) * np.clip((58.3 - tt) / 1.2, 0, 1))
mus = reverb(M.stereo() * (g_duck * tagdip)[:, None], rt=1.4, wet=.35)
vox = reverb(V.stereo(), rt=.7, wet=.08)
foley = F.stereo(); amb = A.stereo() * g_amb[:, None]
# balance: voice about 10 dB over the music while speaking
sp = vm ** 2 > 1e-6
def rms(x, m): return np.sqrt(np.mean(x[m] ** 2)) + 1e-9
k_m = rms(vox[:, 0], sp) / rms(mus[:, 0], sp) * 10 ** (-10 / 20)
mix = vox + mus * k_m + foley * .9 + amb * .9
mix = np.stack([sfx.limit(mix[:, 0], .72), sfx.limit(mix[:, 1], .72)], 1)
write(os.path.join(HERE, 'out', 'mix.wav'), mix[:int((DUR + .5) * SR)])
print('mix written; music gain', round(float(k_m), 3))
