"""Five Views of One Bay — shakuhachi, shamisen, koto, taiko, foley, voice → out/mix.wav"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from synth import *
sys.path.insert(0, os.path.join(LIB, 'core', 'audio'))
import pluck as PL
ev = json.load(open(os.path.join(HERE, 'events.json'))); DUR = ev['dur']; EV = ev['ev']; rng = np.random.default_rng(13)
MA0, MA1 = 38.0, 39.6          # the ostinato and roll stop at MA0; one shamisen note rings until the crash at MA1
M = Mix(DUR); S = Mix(DUR); A = Mix(DUR)

def shaku(m, at, dur, v=.5, slide=-1.0, drop=0.0, pan=0):
    n = int((dur + .5) * SR); t = np.arange(n) / SR; f0 = mtof(m)
    f = f0 * 2 ** ((slide * np.exp(-t / .09) + drop * np.clip((t - (dur - .6)) / .6, 0, 1) * -2) / 12) * (1 + .006 * np.sin(2 * np.pi * 5 * t) * np.clip(t / 1.0, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / SR; y = np.sin(ph) + .22 * np.sin(2 * ph) + .08 * np.sin(3 * ph)
    br = bp(noise(dur + .5), 1200, 4200, 2)[:n] * (.35 + .25 * np.sin(2 * np.pi * .7 * t))
    e = np.minimum(1, t / .3) * np.where(t < dur, 1, np.clip(1 - (t - dur) / .5, 0, 1)) * (1 + .1 * np.sin(2 * np.pi * 3.3 * t))
    M.put(((y * .6 + br * .35) * e * v).astype(np.float32), at, 1, pan)
def taiko(at, v=.8, big=False):
    d = 1.1 if big else .38; t = t_(d); f = (95 if big else 70) * np.exp(-t * 9) + 38; y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (.35 if big else .09))
    y += lp(noise(d), 600, 2) * np.exp(-t / .03) * .6; M.put((y * v).astype(np.float32), at, 1, 0)
def rim(at, v=.3): t = t_(.08); M.put((bp(noise(.08), 1800, 5000, 2) * np.exp(-t / .015) * v).astype(np.float32), at, 1, .1)
def sham(p, at, d=1.0, v=.7, **kw): M.put(PL.pluck('shamisen', p, d, vel=v, **kw), at, 1, .12)
def koto(p, at, d=1.5, v=.6, **kw): M.put(PL.pluck('koto', p, d, vel=v, **kw), at, 1, -.2)

# ---------------- print 1: breath and one chime
shaku(62, 1.0, 3.6, .5); shaku(67, 4.9, 2.6, .45); shaku(69, 8.0, 3.0, .42, drop=1.0)
# ---------------- print 2: koto on a rocking taiko heartbeat
for i, (p, t) in enumerate([('D4', 13.2), ('A4', 14.6), ('G4', 16.0), ('A4', 17.0), ('D5', 18.6), ('Bb4', 19.8)]): koto(p, t, 1.6, .55)
def bpm(t): return 60 + 72 * np.clip((t - 12) / 26, 0, 1)
t = 12.0; k = 0
while t < 36.4:
    if not (MA0 <= t < MA1):
        taiko(t, .55 + .25 * (t - 12) / 26); rim(t + 60 / bpm(t) * .5, .2)
    t += 60 / bpm(t); k += 1
# ---------------- print 3-4: shamisen ostinato, accelerating clappers, taiko roll into the cut
pat = ['D3', 'D3', 'A3', 'D3', 'Eb3', 'D3', 'A3', 'G3']; t = 22.0; i = 0
while t < 37.9:
    sham(pat[i % 8], t, .35, .55 + .25 * (t - 22) / 16, bend=None); t += 60 / bpm(t) / 2 * (1 if t < 30 else .8); i += 1
t = 28.5; gap = .8
while t < 31.2: S.put(sfx.clack(1.0 + .1 * (t % .3)) * .5 if hasattr(sfx, 'clack') else rim(t), t, 1, .2); gap *= .8; t += gap
rt = 35.6
while rt < MA0 - .02: taiko(rt, .5 + .5 * (rt - 35.6) / 2.4, False); rt += .14 - .1 * min(1, (rt - 35.6) / 2.4)
# ---------------- the cut: absolute silence, then the crash
sham('A3', 38.0, 3.4, .85, bend=[(0.0, 0)])          # the sawari note: left alone, ringing
taiko(MA1, 1.0, True)
n = noise(2.2); tt = t_(2.2); S.put((bp(n, 1800, 9000, 2) * np.exp(-tt / .6) * .5 + lp(n, 500, 2) * np.exp(-tt / .9) * .6).astype(np.float32), MA1, 1, 0)
for i in range(9): sham('A3' if i % 2 else 'D3', MA1 + .3 + i * .18, .4, .8)
for t0 in np.arange(MA1 + 1.4, 44, .27): taiko(float(t0), max(.15, .8 - (t0 - MA1) * .08), False)
sham('A3', 41.2, 3.0, .6, trem=14)
# ---------------- print 5: the exhale
shaku(62, 47.8, 3.4, .5); shaku(67, 51.4, 3.0, .4, drop=1.0); sham('A3', 52.8, 4.0, .45)
koto('D4', 49.5, 2.5, .4); koto('A4', 54.0, 3.0, .35)
S.put(tone(1, .1, [(1100, 1, 1), (2200, .3, .6), (3300, .1, .5)], 1.6, rel=2.2) * .22, 58.7, 1, 0)

# ---------------- foley
def baren(d=.8, v=.35):
    t = t_(d); n = bp(noise(d), 700, 3200, 2) * (1 + .5 * np.sin(2 * np.pi * 4.2 * t)) * np.sin(np.pi * t / d) ** .7; return (n * v).astype(np.float32)
def slide(d, v=.5):
    d += .5; t = t_(d); n = bp(noise(d), 300, 2600, 2) * np.sin(np.pi * t / d) ** 1.3 + lp(noise(d), 160, 2) * np.sin(np.pi * t / d) * 1.2; return (n * v).astype(np.float32)
def wood(f=600, v=.4): t = t_(.1); return (np.sin(2 * np.pi * f * t) * np.exp(-t / .02) * v + bp(noise(.1), 800, 3000, 2) * np.exp(-t / .008) * v * .5).astype(np.float32)
def stamp(v=.7): t = t_(.35); y = np.sin(2 * np.pi * 70 * t) * np.exp(-t / .07) * v + lp(noise(.35), 1300, 2) * np.exp(-t / .05) * .3; y[int(.18 * SR):int(.24 * SR)] += hp(noise(.06), 2500, 1) * .05; return y.astype(np.float32)
for e in EV:
    t = e['t']; k = e['type']
    if k == 'baren': S.put(baren(), t, 1, rng.uniform(-.2, .2)); S.put(wood(300, .25), t, 1, 0)
    elif k in ('seal', 'seal2'): S.put(stamp(), t, 1, 0)
    elif k == 'drop': S.put(wood(700, .22), t, 1, .2)
    elif k == 'slide': S.put(slide(e['d'], .55 + .15 * e['i']), t, 1, 0)
    elif k == 'thunder': S.put((lp(noise(2.4), 140, 2) * np.exp(-t_(2.4) / .8) * 1.2).astype(np.float32), t, 1, 0)
    elif k == 'claw': S.put((bp(noise(.5), 600, 5000, 2) * np.sin(np.pi * t_(.5) / .5) * .3).astype(np.float32), t, 1, rng.uniform(-.7, .7))
    elif k == 'zoom': S.put(slide(.6, .5), t, 1, 0)
    elif k == 'lamp': S.put((hp(noise(.6), 2500, 1) * (np.random.default_rng(3).random(int(.6 * SR)) > .995) * .2).astype(np.float32), t, 1, -.5)
    elif k == 'wash': S.put((bp(noise(2.4), 500, 3500, 2) * np.sin(np.pi * t_(2.4) / 2.4) ** 1.5 * .3).astype(np.float32), t, 1, 0)

# ---------------- ambience
def bed(x, a, b, fi=1.5, fo=1.5, g=1.0):
    n = len(x); t = np.arange(n) / SR; env = np.clip((t - a) / fi, 0, 1) * np.clip((b - t) / fo, 0, 1) * ((t >= a) & (t <= b)); return (x * env * g).astype(np.float32)
nn = lambda: noise(A.n / SR)
tg = np.arange(A.n) / SR
for pan in (-.25, .25):
    b = bed(lp(nn(), 900, 1) * (1 + .5 * np.sin(2 * np.pi * .11 * tg + pan)), 0.5, 60, 2, 2, .06)         # surf
    b += bed(bp(nn(), 2000, 9000, 2), 25.5, 47, 2.5, 3.5, .13)                                              # rain from the noon sheet, easing after the storm
    b += bed(bp(nn(), 150, 700, 1), 22.0, 47, 3, 3, .07)                                                    # wind
    b += bed(np.sin(2 * np.pi * 4300 * tg) * (np.sin(2 * np.pi * 7.5 * tg) > .3) * .04, 48.0, 56, 2, 2, 1.0)     # crickets
    A.put(b, 0, 1, pan)

# ---------------- voice + mix
cues = [e for e in EV if e['type'] == 'voice']
V = voice_track(M, None, os.path.join(HERE, 'out', 'voice'), cues, gain=1.0)
vm = V.L + V.R; gd = duck(vm, depth=.55, att=.05, rel=.6); ga = duck(vm, depth=.25, att=.1, rel=.8)
mus = reverb(M.stereo() * gd[:, None], rt=1.7, wet=.32); sfxb = reverb(S.stereo(), rt=.9, wet=.12); amb = A.stereo() * ga[:, None]
vox = reverb(V.stereo(), rt=.8, wet=.06)
sp = vm ** 2 > 1e-6
def rms(x, m): return np.sqrt(np.mean(x[m] ** 2)) + 1e-9
k_m = rms(vox[:, 0], sp) / rms(mus[:, 0], sp) * 10 ** (-9 / 20)
mix = vox + mus * k_m + sfxb * .9 + amb * .9
mix = np.stack([sfx.limit(mix[:, 0], .75), sfx.limit(mix[:, 1], .75)], 1)
write(os.path.join(HERE, 'out', 'mix.wav'), mix[:int((DUR + .5) * SR)])
print('mix written; music gain', round(float(k_m), 3))
