"""One Coin a Day — chiptune score, bit-crushed foley, voice → out/mix.wav"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from synth import *
ev = json.load(open(os.path.join(HERE, 'events.json'))); DUR = ev['dur']; EV = ev['ev']; rng = np.random.default_rng(9)
BEAT = .5; BAR = 2.0

def env(n, a=.002, d=.06, s=.65, r=.04, dur=None):
    t = np.arange(n) / SR; dur = dur if dur is not None else n / SR - r
    e = np.minimum(1, t / a) * (s + (1 - s) * np.exp(-t / d)); rel = np.clip(1 - (t - dur) / r, 0, 1); return e * np.where(t < dur, 1, rel)
def pulse(f, dur, duty=.5, vel=.5, r=.04):
    n = int((dur + r) * SR); t = np.arange(n) / SR; y = np.where(((f * t) % 1) < duty, 1., -1.) * .5; return (y * env(n, dur=dur, r=r) * vel).astype(np.float32)
def tri(f, dur, vel=.6, r=.05):
    n = int((dur + r) * SR); t = np.arange(n) / SR; y = 2 * np.abs(2 * ((f * t) % 1) - 1) - 1; y = np.round(y * 7.5) / 7.5; return (y * env(n, a=.003, d=.5, s=.9, dur=dur, r=r) * vel).astype(np.float32)
def crush(x, bits=6, down=2):
    y = np.repeat(x[::down], down)[:len(x)]; q = 2 ** (bits - 1); return np.round(y * q) / q
def kick(v=.8): t = t_(.14); f = 160 * np.exp(-t * 22) + 45; return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .05) * v).astype(np.float32)
def snare(v=.5): t = t_(.12); n = noise(.12); return (crush(bp(n, 900, 7000, 2), 4, 3) * np.exp(-t / .035) * v).astype(np.float32)
def hat(v=.25): t = t_(.04); return (hp(noise(.04), 6000, 2) * np.exp(-t / .01) * v).astype(np.float32)
def echo(x, wet=.4):
    ir = np.zeros(int(1.0 * SR)); ir[0] = 1
    for d, g in [(.18, .55), (.27, .45), (.37, .38), (.55, .25), (.64, .2), (.74, .16), (.92, .1)]: ir[int(d * SR)] += g * wet * 2
    ir = lp(ir, 5200, 1); out = np.zeros_like(x)
    for c in range(x.shape[1]): out[:, c] = fftconvolve(x[:, c], ir, 'full')[:len(x)]
    return out

M = Mix(DUR); S = Mix(DUR)   # music bus, sfx bus
def put(bus, x, at, g=1.0, pan=0.0): bus.put(x, at, g, pan)
def L(m, at, d, duty=.25, v=.5, pan=.1): put(M, pulse(mtof(m), d, duty, v), at, 1, pan)
def B(m, at, d, v=.7): put(M, tri(mtof(m), d, v), at, 1, 0)
def ARP(chord, t0, t1, step=.125, duty=.125, v=.22):
    t = t0; i = 0
    while t < t1 - .01: put(M, pulse(mtof(chord[i % len(chord)]), step * .9, duty, v), t, 1, -.15); t += step; i += 1
def DR(t0, t1, kicks=True, snares=True, hats=True, hv=.2):
    t = t0; b = 0
    while t < t1 - .01:
        if kicks and b % 4 in (0, 2): put(M, kick(.5), t, 1, 0)
        if snares and b % 4 in (1, 3): put(M, snare(.28), t, 1, .05)
        if hats: put(M, hat(hv), t, 1, .15); put(M, hat(hv * .6), t + BEAT / 2, 1, .15)
        t += BEAT; b += 1

# ---- A title
for i, m in enumerate([72, 76, 79, 84]): L(m, .2 + i * .2, .18, .5, .5)
L(84, 1.0, .9, .5, .35); B(36, .2, 1.4, .6)
for bar, (root, ch) in enumerate([(36, [60, 64, 67]), (43, [59, 62, 67])]): B(root, 1.6 + bar * BAR, BAR * .9, .55); ARP(ch + [ch[0] + 12], 1.6 + bar * BAR, 1.6 + (bar + 1) * BAR, .25, .25, .2)
# ---- B room: gentle
prog = [(36, [60, 64, 67], 76), (33, [57, 60, 64], 72), (29, [53, 57, 60], 69), (31, [55, 59, 62], 71)]
for bar in range(4):
    t0 = 4.0 + bar * BAR; root, ch, mel = prog[bar]
    B(root, t0, BEAT * 1.8, .55); B(root + 12, t0 + 1.0, BEAT * 1.8, .45); ARP(ch + [ch[1] + 12], t0, t0 + BAR, .25, .125, .12)
    L(mel, t0 + .5, .4, .25, .28); L(mel + 4 if bar % 2 == 0 else mel + 3, t0 + 1.5, .45, .25, .26)
for i, m in enumerate([76, 79, 84]): L(m, 9.6 + i * .16, .2, .5, .35)           # the coin motif, first heard
# ---- C seasons: the motif in four keys, layers come and go
keys = [(11.2, 15.0, 0, 'spring'), (15.0, 18.8, 2, 'summer'), (18.8, 22.6, -3, 'autumn'), (22.6, 26.2, 4, 'winter')]
chordsets = {'spring': [(0, 'M'), (-3, 'm'), (-7, 'M'), (-5, 'M')], 'summer': [(0, 'M'), (-3, 'm'), (-7, 'M'), (-5, 'M')], 'autumn': [(0, 'm'), (-4, 'M'), (-9, 'M'), (-5, 'M')], 'winter': [(0, 'm'), (-4, 'M'), (-9, 'M'), (-2, 'M')]}
for t0, t1, tr, name in keys:
    base = 48 + tr; bars = int(round((t1 - t0) / BAR)); cs = chordsets[name]
    for bar in range(max(1, bars)):
        a = t0 + bar * BAR; off, q = cs[bar % 4]; root = base + off; third = root + (3 if q == 'm' else 4); ch = [root + 12, third + 12, root + 19]
        B(root - 12, a, BEAT * .9, .6); B(root - 12, a + BEAT, BEAT * .9, .5); B(root - 12 + 7, a + 1.0, BEAT * .9, .5); B(root - 12, a + 1.5, BEAT * .9, .5)
        mel = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12] if bar % 2 == 0 else [ch[2] + 12, ch[1] + 12, ch[0] + 12 + 2, ch[0] + 12]
        for i, m in enumerate(mel): L(m, a + i * BEAT, BEAT * .85, .25 if name != 'winter' else .5, .3)
        if name in ('summer', 'autumn'): ARP(ch + [ch[1] + 12], a, a + BAR, .125, .125, .16)
    if name in ('summer', 'autumn'): DR(t0, t1, True, name == 'autumn', True, .16)
    if name == 'winter': DR(t0, t1, True, False, False)
# ---- D battle (A minor), thin at the hesitation, full again on SAVE
bp_ = [(33, [57, 60, 64]), (29, [53, 57, 60]), (31, [55, 59, 62]), (28, [52, 55, 59])]
def battle(a0, a1):
    t = a0; bar = 0
    while t < a1 - .01:
        root, ch = bp_[bar % 4]
        for i in range(4):
            B(root, t + i * BEAT, BEAT * .45, .6); B(root + 12, t + i * BEAT + BEAT / 2, BEAT * .4, .5)
        ARP(ch + [ch[0] + 12, ch[1] + 12, ch[2] + 12], t, min(t + BAR, a1), .0625, .125, .2); t += BAR; bar += 1
battle(27.4, 31.9); DR(27.4, 31.9, True, True, True, .22)
B(33, 31.9, 1.8, .5); B(33, 31.9, 1.8, .0)
for i in range(4): put(M, kick(.28), 31.9 + i * .5, .6, 0); put(M, hat(.12), 32.15 + i * .5, 1, .2)
for i in range(4): put(M, kick(.28), 32.9 + i * .5, .6, 0)
for i, m in enumerate([57, 58, 57, 58, 57, 58]): L(m, 32.0 + i * .3, .2, .125, .12)
battle(33.8, 38.0); DR(33.8, 38.0, True, True, True, .25)
for i in range(8): put(M, snare(.4 + i * .04), 35.3 + i * .06, 1, 0)                      # the enemy breaks up
# level-up fanfare (pulse 50%)
for i, m in enumerate([67, 72, 76, 79, 84]): L(m, 38.0 + i * .1, .12, .5, .5)
L(84, 38.5, .5, .5, .45); L(79, 38.5, .5, .5, .3); L(76, 38.5, .5, .3, .3)
for i, m in enumerate([84, 83, 84]): L(m, 39.1 + i * .12, .1, .25, .3)
B(36, 38.0, 2.2, .55)
# ---- E: silence 41.4 -> 45.2 (the music is simply absent)
# ---- flood: full colour returns
for i in range(16): L(60 + (i % 8) * 2 + (12 if i >= 8 else 0), 45.2 + i * .075, .1, .5, .3)
B(36, 45.2, 1.4, .65); L(84, 46.0, .5, .5, .4)
# ---- F shop
shop = [(36, [60, 64, 67], 72), (29, [60, 65, 69], 69), (31, [59, 62, 67], 71), (36, [60, 64, 67], 72)]
t = 46.6; bar = 0
while t < 53.2 - .5:
    root, ch, mel = shop[bar % 4]
    for i in range(4): B(root + (0 if i % 2 == 0 else 7), t + i * BEAT, BEAT * .8, .5)
    for i, m in enumerate(ch): L(m + 12, t + i * BEAT * 1.0, BEAT * .7, .5, .22)
    L(mel + 12, t + 1.5, .45, .25, .28); t += BAR; bar += 1
put(S, tone(1, .05, [(1760, 1, 1), (2640, .5, .6), (3520, .2, .4)], .9, rel=.6) * .5, 46.6, .8, 0)
# item-get jingle
for i, m in enumerate([72, 76, 79, 84, 88, 91, 96]): L(m, 53.4 + i * .09, .1, .25, .45)
L(96, 54.0, .7, .5, .4); L(91, 54.0, .7, .5, .25); L(84, 54.0, .7, .25, .25); B(36, 53.4, 1.6, .6)
# ---- G hill: the motif resolved, then the tonic
for i, m in enumerate([76, 79, 84]): L(m, 55.6 + i * .3, .45, .5, .35)
for t0, ch in [(56.6, [60, 64, 67]), (57.8, [53, 57, 60]), (59.0, [60, 64, 67, 72])]:
    for m in ch: put(M, pulse(mtof(m), 1.5, .5, .12), t0, 1, 0)
B(36, 56.6, 1.1, .5); B(29, 57.8, 1.1, .5); B(36, 59.0, 1.9, .6)

# ---- sfx
def blip(f, d=.05, duty=.5, v=.5, sl=0.0):
    n = int(d * SR); t = np.arange(n) / SR; ph = np.cumsum(f * (1 + sl * t / d)) / SR; return (np.where((ph % 1) < duty, 1., -1.) * np.exp(-t / (d * .8)) * v * .5).astype(np.float32)
def clink(f=2400, v=.5): return (crush(tone(1, .05, [(f, 1, 1), (f * 1.5, .5, .7), (f * 2.2, .2, .4)], .09, rel=.18), 5, 1) * v).astype(np.float32)
def bitnoise(d, lo, hi, v=.3, sweep=True):
    n = noise(d); t = t_(d); y = bp(n, lo, hi, 2) * (np.sin(np.pi * t / d) if sweep else 1); return crush(y, 4, 3).astype(np.float32) * v
for e in EV:
    t = e['t']; k = e['type']
    if k == 'type':
        n = e['n']; who = e.get('who'); v = .07 if e.get('voiced') else .2; f = {'boy': 700, 'shop': 330, 'sys': 520}.get(who, 520)
        for i in range(0, n, 2): put(S, blip(f * (1 + (i % 3) * .06), .03, .25, v), t + i / e['cps'], 1, 0)
    elif k == 'step': put(S, crush(hp(noise(.025), 1500, 1) * np.exp(-t_(.025) / .007) * e['g'] * .5, 4, 2), t, 1, rng.uniform(-.1, .1))
    elif k == 'coin': put(S, clink(2000 + (e['day'] % 6) * 140, .28), t, 1, .5)
    elif k == 'drop': put(S, blip(1500, .04, .5, .4, -.4), t - .22, 1, 0); put(S, clink(1800, .9), t, 1, 0); put(S, clink(2700, .5), t + .06, 1, 0)
    elif k == 'drop2': put(S, clink(1800, 1.0), t, 1, 0); put(S, clink(2700, .6), t + .05, 1, 0); put(S, clink(3600, .4), t + .12, 1, 0)
    elif k == 'mosaic': put(S, bitnoise(.6, 300, 4000, .3), t, 1, 0)
    elif k == 'swirl':
        put(S, bitnoise(1.2, 200, 6000, .4), t, 1, 0)
        for i in range(12): put(S, blip(300 * 1.12 ** i, .08, .5, .3), t + i * .09, 1, 0)
    elif k == 'season': [put(S, blip(1200 / (1.3 ** i), .07, .25, .4), t + i * .06, 1, 0) for i in range(4)]
    elif k == 'cursor': put(S, blip(880, .04, .5, .4), t, 1, 0)
    elif k == 'select': put(S, blip(1320, .05, .5, .4), t, 1, 0); put(S, blip(1760, .08, .5, .4), t + .06, 1, 0)
    elif k == 'toss': put(S, blip(500, .45, .5, .35, 2.0), t, 1, 0)
    elif k == 'ko': put(S, bitnoise(1.0, 400, 5000, .4, False) * np.abs(np.sin(np.pi * 12 * t_(1.0))), t, 1, 0)
    elif k == 'levelup': pass
    elif k == 'flood': put(S, bitnoise(1.4, 100, 7000, .25), t, 1, 0)
    elif k == 'tick': put(S, blip(1500 - 700 * (t - 51.8) / 1.4, .03, .25, .35), t, 1, 0)
    elif k == 'itemget': pass
    elif k == 'savetick': put(S, blip(900 + 120 * round((t - 58.3) / .28), .05, .25, .35), t, 1, 0)
    elif k == 'bell': pass

# ---- voice + mix
cues = [e for e in EV if e['type'] == 'voice']
V = voice_track(M, None, os.path.join(HERE, 'out', 'voice'), cues, gain=1.0)
vm = V.L + V.R; g_duck = duck(vm, depth=.45, att=.04, rel=.4)
bus = M.stereo() * g_duck[:, None] * .55 + S.stereo()
bus = echo(bus, .32)
vox = V.stereo()
# true zero: no music, no echo tails between 41.4 and 42.2 (and a clean 44.0..44.6 beat is left to the voice)
tt = np.arange(M.n) / SR; gate = np.where((tt >= 41.4) & (tt < 42.2), 0.0, 1.0).astype(np.float32); bus = bus * gate[:, None]
# the music steps out from 40.9 so nothing rings into the silence
bus *= (1 - np.clip((tt - 40.8) / .6, 0, 1) * ((tt < 45.2)))[:, None]
sp = vm ** 2 > 1e-6
def rms(x, m): return np.sqrt(np.mean(x[m] ** 2)) + 1e-9
k_m = rms(vox[:, 0], sp) / rms(bus[:, 0], sp) * 10 ** (-9 / 20)
mix = vox + bus * k_m
mix = np.stack([sfx.limit(mix[:, 0], .72), sfx.limit(mix[:, 1], .72)], 1)
write(os.path.join(HERE, 'out', 'mix.wav'), mix[:int((DUR + .5) * SR)])
print('mix written; bus gain', round(float(k_m), 3))
