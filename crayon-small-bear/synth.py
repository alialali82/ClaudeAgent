"""Small additive-synthesis + mixing toolkit shared by the four films (numpy/scipy/soxr on top of core/audio/sfx.py)."""
import os, sys, json
import numpy as np
LIB = os.environ.get('LIB', '/root/lemo-opuscar')
sys.path.insert(0, os.path.join(LIB, 'core', 'audio'))
import sfx
from sfx import SR, t_, noise, bp, lp, hp, norm
import soundfile as sf, soxr
from scipy.signal import fftconvolve, butter, sosfiltfilt


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)


class Mix:
    def __init__(self, dur, tail=2.0):
        self.n = int((dur + tail) * SR); self.L = np.zeros(self.n, np.float32); self.R = np.zeros(self.n, np.float32); self.dur = dur
    def put(self, x, at, gain=1.0, pan=0.0):
        i = int(round(at * SR))
        if i >= self.n or i + len(x) <= 0: return
        a = max(0, -i); b = min(len(x), self.n - i); seg = x[a:b] * gain
        th = (pan + 1) * np.pi / 4
        self.L[i + a:i + b] += seg * np.cos(th) * 1.4142; self.R[i + a:i + b] += seg * np.sin(th) * 1.4142
    def stereo(self): return np.stack([self.L, self.R], 1)


def tone(freq, dur, parts, tau, att=.004, rel=.08, vel=1.0):
    """parts: [(ratio, amp, decay_mult)]; exponential decay body, linear attack, release at the end of `dur`."""
    n = int(round((dur + rel) * SR)); t = np.arange(n) / SR; y = np.zeros(n)
    for r, a, dm in parts:
        f = freq * r
        if f > 18000: continue
        y += a * np.sin(2 * np.pi * f * t + r) * np.exp(-t / (tau * dm))
    e = np.minimum(1, t / att) * np.where(t < dur, 1.0, np.clip(1 - (t - dur) / rel, 0, 1))
    return (y * e * vel).astype(np.float32)


def piano(m, dur=1.6, vel=.8):   # soft felt piano
    f = mtof(m); p = [(1, 1, 1), (2, .38, .55), (3, .16, .4), (4, .08, .3), (5, .04, .25)]
    y = tone(f, dur, p, 1.1 + 40 / f, att=.006, rel=.25, vel=vel)
    h = noise(.02) * np.exp(-t_(.02) / .004) * .05 * vel
    y[:len(h)] += h.astype(np.float32); return lp(y, 3800 + vel * 2500, 2)


def kalimba(m, vel=.7):
    f = mtof(m); return tone(f, .1, [(1, 1, 1), (5.4, .22, .12), (12, .06, .05)], .55, att=.002, rel=.5, vel=vel)


def glock(m, vel=.6):
    f = mtof(m); return tone(f, .1, [(1, 1, 1), (2.76, .35, .5), (5.4, .14, .25), (8.9, .05, .15)], 1.0, att=.001, rel=.9, vel=vel)


def pad(m, dur, vel=.5, att=1.2, rel=1.6, det=.004):
    f = mtof(m); n = int(round((dur + rel) * SR)); t = np.arange(n) / SR; y = np.zeros(n)
    for d in (-det, 0, det):
        ph = 2 * np.pi * f * (1 + d) * t
        y += np.sin(ph) + .35 * np.sin(2 * ph) + .15 * np.sin(3 * ph) + .08 * np.sin(5 * ph) * np.sin(.3 * t)
    e = np.minimum(1, t / att) * np.where(t < dur, 1.0, np.clip(1 - (t - dur) / rel, 0, 1))
    return lp((y / 3 * e * vel).astype(np.float32), 2600, 2)


def softbass(m, dur, vel=.6):
    f = mtof(m); return tone(f, dur, [(1, 1, 1), (2, .3, .5), (3, .12, .3)], 1.6, att=.01, rel=.3, vel=vel)


def reverb(x, rt=1.1, wet=.2, damp=4500, seed=3):
    rng = np.random.default_rng(seed); n = int(rt * SR); t = np.arange(n) / SR
    out = np.zeros_like(x)
    for c in range(x.shape[1]):
        ir = rng.standard_normal(n) * np.exp(-6.9 * t / rt); ir = sfx.lp(ir, damp, 1); ir[:int(.012 * SR)] *= np.linspace(0, 1, int(.012 * SR))
        out[:, c] = fftconvolve(x[:, c], ir, 'full')[:len(x)] * .05
    return x * (1 - wet * .3) + out * wet * 4


def voice_track(m, lines, dir_, cues, gain=1.0, comp_thr=.2):
    """lines: {id: start_time}. Returns the voice-only stereo buffer (compressed), added into a separate Mix."""
    v = Mix(m.dur, tail=m.n / SR - m.dur)
    for cue in cues:
        w, sr = sf.read(os.path.join(dir_, cue['id'] + '.wav'), dtype='float32')
        if w.ndim > 1: w = w.mean(1)
        w = soxr.resample(w, sr, SR).astype(np.float32)
        w = sfx.compress(w, thr=comp_thr, ratio=3.2); w = hp(w, 90, 2); w = lp(w, 9500, 2)
        w = w / (np.sqrt(np.mean(w ** 2)) + 1e-9) * .12 * gain
        v.put(w, cue['t'], 1.0, -.05)
    return v


def duck(env_src, depth=.5, att=.05, rel=.5):
    """gain curve that dips when env_src (mono) is loud: fast attack, slow release."""
    e = np.abs(env_src); k = int(SR * .02); e = np.convolve(e, np.ones(k) / k, 'same')
    thr = np.percentile(e[e > 1e-4], 70) if (e > 1e-4).any() else 1.0
    tgt = np.clip(e / (thr + 1e-9), 0, 1); step = 48
    a = np.exp(-step / (att * SR)); r = np.exp(-step / (rel * SR)); y = 0.0; out = np.empty(len(e))
    for i in range(0, len(e), step):
        c = tgt[i]; co = a if c > y else r; y = c + (y - c) * co; out[i:i + step] = y
    return 1 - depth * out


def write(path, st, peak=.9):
    m = np.abs(st).max(); st = st * (peak / m) if m > peak else st
    sf.write(path, st.astype(np.float32), SR, subtype='FLOAT')


def events(path):
    return json.load(open(path))
