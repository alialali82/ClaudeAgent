import { clamp, lerp, seg, ss, eio, eo, mulberry, vnoise, hash, TAU } from '/core/lib.js';

const W = 1920, H = 1080, DUR = 60, GY = 770;
window.DUR = DUR;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const cWax = mk(), cWhite = mk(), cWash = mk(), cChar = mk(), cMask = mk(), cTop = mk(), cPage = mk();
const gWax = cWax.getContext('2d', { willReadFrequently: true }), gWhite = cWhite.getContext('2d', { willReadFrequently: true }), gWash = cWash.getContext('2d', { willReadFrequently: true }),
  gChar = cChar.getContext('2d', { willReadFrequently: true }), gMask = cMask.getContext('2d', { willReadFrequently: true }), gTop = cTop.getContext('2d', { willReadFrequently: true }), gPage = cPage.getContext('2d');

const VOICE = [
  { id: 'v1', t: 3.6, d: 1.804, text: 'Little Bear loved the whole day.' },
  { id: 'v2', t: 7.2, d: 2.158, text: 'It was only the dark he did not love.' },
  { id: 'v3', t: 10.6, d: 3.879, text: 'Every night it waited in the cave, a big scribble with no face.' },
  { id: 'v4', t: 20.0, d: 3.813, text: 'But tonight the dark was not empty. It was only unfinished.' },
  { id: 'v5', t: 25.2, d: 4.271, text: 'A little light appeared, one scribble at a time, always one step ahead.' },
  { id: 'v6', t: 31.4, d: 1.142, text: 'So he followed it.' },
  { id: 'v7', t: 39.6, d: 2.708, text: 'The dark had colours in it, like everything else.' },
  { id: 'v8', t: 52.2, d: 1.824, text: 'And Little Bear slept very well.' },
];
window.VOICE = VOICE;
const subEnd = v => v.t + Math.max(1.8, v.d + .6, v.text.length / 15 + 1.2);
const COL = { ind: '43,40,98', night: '34,30,84', violet: '112,76,160', brown: '150,92,46', tan: '228,178,112', orange: '236,128,36', yellow: '248,212,52', pink: '240,128,148', green: '86,160,70', dgreen: '44,110,64', rust: '196,96,48' };

/* ------------------------------------------------------------------ paper tooth (anchored to the page) */
const TW = 2048; let TOOTH, PAPERL;
function makeTooth() {
  TOOTH = new Float32Array(TW * TW); const r = mulberry(7);
  const oct = [[256, .34], [64, .3], [16, .22], [4, .14]].map(([c, a]) => { const n = TW / c, L = new Float32Array(n * n); for (let i = 0; i < L.length; i++) L[i] = r(); return { c, a, n, L }; });
  for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) {
    let v = 0; for (const o of oct) { const fx = x / o.c, fy = y / o.c, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy), n = o.n; const a = o.L[(iy % n) * n + ix % n], b = o.L[(iy % n) * n + (ix + 1) % n], c = o.L[((iy + 1) % n) * n + ix % n], d = o.L[((iy + 1) % n) * n + (ix + 1) % n]; v += ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) * o.a; }
    v += (r() - .5) * .16 + (vnoise(x / 3 + (y >> 4) * 7.1) - .5) * .12;   // fibres run horizontally
    TOOTH[y * TW + x] = Math.min(1, Math.max(0, (v - .5) * 1.35 + .5));
  }
  PAPERL = new Uint8Array(TW * TW);
  for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const i = y * TW + x, e = (TOOTH[i] - TOOTH[((y + 1) & (TW - 1)) * TW + ((x + 1) & (TW - 1))]) * 9; PAPERL[i] = Math.max(0, Math.min(255, 238 + (TOOTH[i] - .5) * 12 + e)); }
}

/* ------------------------------------------------------------------ crayon primitives */
function smooth(pts, step) {
  const n = pts.length, out = [];
  if (n < 3) { const a = pts[0], b = pts[n - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(2, Math.ceil(L / step)); for (let i = 0; i <= m; i++) out.push([lerp(a[0], b[0], i / m), lerp(a[1], b[1], i / m)]); return out; }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)], L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < m; k++) { const t = k / m, t2 = t * t, t3 = t2 * t; out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  out.push(pts[n - 1]); return out;
}
let F12 = 0, JM = 1;
function crayon(g, pts, w, col, press, seed, o = {}) {
  const frac = o.f ?? 1; if (frac <= 0) return; const jit = (o.jit ?? 1.1) * (o.still ? 1 : JM), S = smooth(pts, o.step || 10), n = S.length, m = Math.max(2, Math.min(n, Math.ceil(frac * (n - 1)) + 1)), fr = o.still ? 0 : F12;
  const Lp = [], Rp = []; const P = [];
  for (let i = 0; i < m; i++) { P.push([S[i][0] + (hash(seed * 3.1 + i * 1.7 + fr * 11.3) - .5) * 2 * jit, S[i][1] + (hash(seed * 5.3 + i * 2.3 + fr * 7.7) - .5) * 2 * jit]); }
  for (let i = 0; i < m; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(m - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const u = i / Math.max(1, n - 1), tp = o.notaper ? 1 : Math.min(1, u * 6 + .3) * Math.min(1, (1 - u) * 6 + .3), ww = w * tp * (1 + .16 * (vnoise(seed + u * 6) - .5) * 2);
    Lp.push([P[i][0] - ty * ww / 2, P[i][1] + tx * ww / 2]); Rp.push([P[i][0] + ty * ww / 2, P[i][1] - tx * ww / 2]);
  }
  g.fillStyle = `rgba(${col},${press * .88})`; g.beginPath(); Lp.forEach(p => g.lineTo(p[0], p[1])); for (let i = m - 1; i >= 0; i--) g.lineTo(Rp[i][0], Rp[i][1]); g.closePath(); g.fill();
  if (w > 7) { g.strokeStyle = `rgba(${col},${Math.min(1, press)})`; g.lineWidth = Math.max(1.4, w * .12); for (const off of [-.27, .27]) { g.beginPath(); for (let i = 1; i < m - 1; i++) g.lineTo(P[i][0] + (Rp[i][0] - Lp[i][0]) * off, P[i][1] + (Rp[i][1] - Lp[i][1]) * off); g.stroke(); } }
}
const ep = (cx, cy, rx, ry, n = 22, rot = 0) => { const o = []; for (let i = 0; i <= n + 1; i++) { const a = rot + i / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([cx + x, cy + y]); } return o; };
const ellScan = (cx, cy, rx, ry) => y => { const k = 1 - ((y - cy) / ry) ** 2; if (k <= 0) return null; const h = rx * Math.sqrt(k); return [cx - h, cx + h]; };
function hatch(g, scan, y0, y1, col, press, prog, seed, o = {}) {
  const row = o.row ?? 13, nrows = Math.max(1, Math.floor((y1 - y0) / row)), todo = prog * nrows; let d = 1;
  for (let r = 0; r < Math.ceil(todo); r++) {
    const y = y0 + r * row + row / 2, s = scan(y); if (!s) { d = -d; continue; } const f = clamp(todo - r), os = 3 + hash(seed + r) * 5, a = s[0] - os, b = s[1] + os, p = press * (.72 + .28 * hash(seed * 2 + r));
    const pts = d > 0 ? [[a, y + (hash(r + seed) - .5) * 5], [b, y + (hash(r * 3 + seed) - .5) * 5]] : [[b, y + (hash(r + seed) - .5) * 5], [a, y + (hash(r * 3 + seed) - .5) * 5]];
    crayon(g, pts, row * 1.12, col, p, seed + r, { f, jit: o.jit ?? .8, still: o.still ?? true, notaper: true, step: 30 }); d = -d;
  }
}
const starPts = (cx, cy, R, r, rot = -Math.PI / 2) => { const o = []; for (let i = 0; i <= 10; i++) { const a = rot + i * Math.PI / 5, q = i % 2 ? r : R; o.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); } return o; };

/* ------------------------------------------------------------------ timeline */
const TURNS = [[18.0, 19.3], [37.4, 38.6]];
const pageOf = t => t < TURNS[0][1] ? 0 : t < TURNS[1][1] ? 1 : 2;
const turnAt = t => TURNS.findIndex(([a, b]) => t >= a && t < b);
const setCam = (g, c) => { g.setTransform(c.z, 0, 0, c.z, W / 2 - c.cx * c.z, H / 2 - c.cy * c.z); };
const SUN = [700, 700];
function bearX(t, p) {
  if (p === 0) return t < 7 ? 520 : t < 11 ? lerp(520, 930, ss(seg(t, 7, 11))) : t < 14 ? 930 : t < 17 ? lerp(930, 860, ss(seg(t, 14, 16.4))) : 860;
  if (p === 1) return t < 23.4 ? 300 : 300 + (t - 23.4) * 118;
  return 960;
}
function camAt(t, p) {
  if (p === 0) {
    const u = eio(seg(t, .8, 6.2)), ty = lerp(500, GY, ss(seg(t, .5, 3.6))); let z = lerp(7, 1, u), cx = lerp(SUN[0] + 30, 960, u), cy = lerp(ty - 30, 540, u);
    const v = ss(seg(t, 11, 17)); z = lerp(z, 1.18, v); cx = lerp(cx, 1130, v); cy = lerp(cy, 560, v); return { cx, cy, z };
  }
  if (p === 1) { const bx = bearX(t, 1); return { cx: bx + 330, cy: 560, z: 1.38 }; }
  const u = ss(seg(t, 38.6, 49)); return { cx: 960, cy: lerp(560, 540, u), z: lerp(1.12, 1, u) };
}
/* boil: calm in the day, rising with the fear, calming as the light leads him on, quiet at the end */
const boilAt = (t, p) => p === 0 ? (t < 11 ? 1 : lerp(1, 2.2, ss(seg(t, 11, 16)))) : p === 1 ? lerp(2.3, .6, ss(seg(t, 23, 36))) : lerp(.5, .3, ss(seg(t, 38.6, 46)));

/* ------------------------------------------------------------------ the bear */
function bearState(t, p) {
  const st = { x: bearX(t, p), y: GY, s: p === 0 ? .82 : p === 1 ? 1 : 1.1, expr: 'open', tilt: 0, arm: 'down', shake: 0, fo: 1, fc: 1, cheeks: 0, walk: 0 };
  if (p === 0) {
    st.fo = seg(t, 3.4, 5.4); st.fc = seg(t, 4.8, 7.0);
    if (t >= 7 && t < 11) st.walk = 1; if (t >= 14 && t < 16.4) st.walk = 1;
    if (t >= 11.5) { st.expr = 'scared'; st.tilt = .05; } if (t >= 14) { st.arm = 'hug'; st.shake = 1.5; }
  } else if (p === 1) {
    if (t < 25.5) { st.expr = 'scared'; st.arm = 'hug'; st.shake = lerp(2.2, 1, seg(t, 20, 25.5)); } else { st.expr = 'open'; }
    if (t >= 23.4) st.walk = 1; if (t >= 33) st.expr = 'happy'; st.cheeks = seg(t, 33, 36);
    if (t >= 26) st.tilt = -.05 * Math.sin(t * 1.3);
  } else {
    st.expr = 'happy'; st.cheeks = 1; st.tilt = -.18 * ss(seg(t, 38.8, 41)); if (t >= 39 && t < 42) st.arm = 'up';
  }
  return st;
}
function drawBear(gc, gm, t, st) {
  gc.save(); gm.save(); for (const g of [gc, gm]) { g.translate(st.x + (st.shake ? Math.round(Math.sin(F12 * 2.1) * st.shake) : 0), st.y); g.scale(st.s, st.s); }
  const wl = st.walk ? (F12 % 2 ? 10 : 0) : 0, bob = st.walk ? (F12 % 2 ? 0 : -3) : 0;   // acting by substitution: two key drawings alternate
  const parts = [['legL', -44 - wl * .5, -20 - (wl ? 0 : 0) - wl * .6, 40, 22, COL.brown], ['legR', 44 + wl * .5, -20 - (10 - wl) * .6, 40, 22, COL.brown], ['body', 0, -120 + bob, 86, 106, COL.brown], ['belly', 0, -104 + bob, 52, 72, COL.tan, 1], ['earL', -62, -316 + bob, 28, 28, COL.brown], ['earR', 62, -316 + bob, 28, 28, COL.brown], ['head', 0, -252 + bob, 82, 76, COL.brown], ['snout', 0, -232 + bob, 38, 28, COL.tan]];
  const N = parts.length, seedB = 40, arms = armPaths(st, bob);
  const sil = (g, pad) => { g.fillStyle = '#000'; for (const [, cx, cy, rx, ry] of parts) { g.beginPath(); g.ellipse(cx, cy, rx + pad, ry + pad, 0, 0, TAU); g.fill(); } for (const a of arms) { g.strokeStyle = '#000'; g.lineWidth = 46 + pad * 2; g.lineCap = 'round'; g.beginPath(); smooth(a, 12).forEach(q => g.lineTo(q[0], q[1])); g.stroke(); } };
  sil(gm, 6);
  const head = fn => { gc.save(); gc.translate(0, -190 + bob); gc.rotate(st.tilt); gc.translate(0, 190 - bob); fn(); gc.restore(); };
  parts.forEach(([nm, cx, cy, rx, ry, col, noOut], i) => {
    const isHead = ['earL', 'earR', 'head', 'snout'].includes(nm), run = () => {
      const fo = clamp(st.fo * N - i * .6), fc = clamp(st.fc * N - i * .5);
      hatch(gc, ellScan(cx, cy, rx, ry), cy - ry, cy + ry, col, .92, fc, seedB + i * 9, { row: 12, still: true, jit: .9 });
      if (!noOut) crayon(gc, ep(cx, cy, rx, ry, 24, i), 6, COL.ind, .96, seedB + i, { f: fo, jit: 1.1 });
    }; if (isHead) head(run); else run();
  });
  arms.forEach((a, ai) => { const fo = clamp((st.fo - .6) * 3); if (fo <= 0) return; crayon(gc, a, 44, COL.brown, .95, 90 + ai, { f: fo, jit: .8, notaper: true }); for (const off of [-1, 1]) { const q = smooth(a, 14).map((pp, i, A) => { const b = A[Math.min(A.length - 1, i + 1)], c = A[Math.max(0, i - 1)]; let tx = b[0] - c[0], ty = b[1] - c[1]; const l = Math.hypot(tx, ty) || 1; return [pp[0] - ty / l * 23 * off, pp[1] + tx / l * 23 * off]; }); crayon(gc, q, 5, COL.ind, .96, 95 + ai * 2 + off, { f: fo, jit: 1 }); } const h = a[a.length - 1]; crayon(gc, ep(h[0], h[1], 20, 20, 14), 5, COL.ind, .96, 99 + ai, { f: fo }); });
  head(() => {
    const e = st.expr, fo = clamp((st.fo - .7) * 3.3); if (fo <= 0) return;
    const eye = (x, y, r) => crayon(gc, [[x - 1, y], [x + 1, y + .5]], r * 2, COL.ind, .98, 70 + x, { jit: .4, notaper: true, step: 3 });
    if (e === 'scared') { eye(-30, -262, 11); eye(30, -262, 11); crayon(gc, [[-48, -292], [-14, -282]], 6, COL.ind, .95, 71, { jit: .8 }); crayon(gc, [[48, -292], [14, -282]], 6, COL.ind, .95, 72, { jit: .8 }); crayon(gc, [[-14, -214], [-6, -219], [2, -213], [10, -219], [16, -214]], 5, COL.ind, .95, 73); }
    else if (e === 'happy') { crayon(gc, [[-42, -262], [-30, -276], [-18, -262]], 6, COL.ind, .96, 74, { jit: .6 }); crayon(gc, [[18, -262], [30, -276], [42, -262]], 6, COL.ind, .96, 75, { jit: .6 }); crayon(gc, [[-20, -218], [0, -202], [20, -218]], 6, COL.ind, .96, 76); }
    else { eye(-30, -264, 8); eye(30, -264, 8); crayon(gc, [[-12, -214], [0, -208], [12, -214]], 5, COL.ind, .95, 77); }
    crayon(gc, [[-16, -246], [0, -240], [16, -246]], 17, COL.ind, .98, 78, { jit: .4, notaper: true, step: 4 });
    if (st.cheeks > 0) for (const sx of [-1, 1]) { const rows = Math.ceil(st.cheeks * 5); for (let r = 0; r < rows; r++) crayon(gc, [[sx * 58 - 14, -240 + r * 7], [sx * 58 + 14, -238 + r * 7]], 8, COL.pink, .85, 80 + r + sx, { jit: .8, notaper: true }); }
  });
  gc.restore(); gm.restore();
}
function armPaths(st, bob) {
  const sL = [-72, -178 + bob], sR = [72, -178 + bob];
  if (st.arm === 'hug') return [[sL, [-60, -150], [30, -142]], [sR, [60, -150], [-30, -136]]];
  if (st.arm === 'up') return [[sL, [-120, -230], [-130, -330]], [sR, [120, -230], [130, -330]]];
  const sw = st.walk ? (F12 % 2 ? 8 : -8) : 0;
  return [[sL, [-100, -140], [-108 - sw, -92]], [sR, [100, -140], [108 + sw, -92]]];
}

/* ------------------------------------------------------------------ the pages */
const hatchRect = (x0, x1) => () => [x0, x1];
const RN = mulberry(77);
const LIGHTS = Array.from({ length: 34 }, (_, i) => ({ x: 520 + i * 70 + (hash(i * 3.1) - .5) * 30, y: 280 + hash(i * 5.7) * 400, k: i % 5 }));
const BURST = Array.from({ length: 96 }, (_, i) => ({ x: 70 + hash(i * 2.3) * 1780, y: 70 + hash(i * 4.1) * 640, k: i % 4, c: [COL.yellow, COL.orange, COL.pink][i % 3], t: 38.9 + hash(i * 7.7) * 1.4, r: 14 + hash(i * 1.9) * 18 }));
function lightItem(g, it, p, t, seed, col = COL.yellow) {
  if (p <= 0) return; const { x, y, k } = it, tw = Math.floor(t * 12 + seed) % 4 === 0;
  if (k === 0 || k === 3) { const r = it.r || 12; hatch(g, ellScan(x, y, r, r), y - r, y + r, col, .96, clamp(p * 2), seed, { row: 6 }); for (let a = 0; a < 8; a++) { if (tw && a % 2) continue; const an = a / 8 * TAU; crayon(g, [[x + Math.cos(an) * (r + 6), y + Math.sin(an) * (r + 6)], [x + Math.cos(an) * (r + 24), y + Math.sin(an) * (r + 24)]], 6, col, .95, seed + a, { f: p, jit: .6 }); } }
  else if (k === 1) { const pts = []; for (let a = 0; a < 12.5; a += .5) pts.push([x + Math.cos(a) * a * 4.2, y + Math.sin(a) * a * 4.2]); crayon(g, pts, 7, col, .95, seed, { f: p, jit: .8 }); }
  else if (k === 2) { crayon(g, [[x, GY + 4], [x + 2, GY - 52]], 16, COL.pink, .92, seed, { f: p }); hatch(g, ellScan(x, GY - 62, 34, 24), GY - 86, GY - 38, col, .95, p, seed + 3, { row: 8 }); crayon(g, ep(x, GY - 62, 34, 24, 14), 4, COL.ind, .9, seed + 5, { f: p }); }
  else { crayon(g, [[x - 30, GY + 22], [x + 6, GY + 30]], 9, col, .95, seed, { f: p }); }
}
function drawPage(t, p, c) {
  for (const g of [gWax, gChar, gMask]) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); setCam(g, c); }
  const fo = (a, b) => seg(t, a, b);
  if (p === 0) {
    // dusk, coloured live by the crayon tip: the page is revealed as the camera pulls back
    hatch(gWax, hatchRect(-80, 2000), 500, GY, COL.orange, .62, fo(.5, 3.6), 11, { row: 16 });
    hatch(gWax, hatchRect(-80, 2000), 270, 520, COL.pink, .6, fo(3.0, 4.8), 12, { row: 16 });
    hatch(gWax, hatchRect(-80, 2000), -60, 290, COL.violet, .62, fo(3.8, 5.6), 13, { row: 16 });
    { const a = fo(1.6, 3.2); if (a > 0) { gWax.save(); gWax.beginPath(); gWax.rect(-100, -100, 2400, GY + 100); gWax.clip(); hatch(gWax, ellScan(SUN[0], GY, 120, 120), GY - 120, GY, COL.yellow, .92, a, 21, { row: 12 }); crayon(gWax, ep(SUN[0], GY, 120, 120, 26), 6, COL.rust, .9, 22, { f: a }); gWax.restore(); } }
    crayon(gWax, [[-60, GY], [400, GY + 6], [900, GY - 4], [1400, GY + 5], [1980, GY]], 7, COL.ind, .9, 5, { f: fo(.6, 3), jit: .7 });
    hatch(gWax, hatchRect(-80, 2000), GY + 6, GY + 330, COL.green, .82, fo(4, 8), 31, { row: 15 });
    for (const [hx, hr, hy] of [[260, 300, 170], [1560, 390, 290]]) { hatch(gWax, ellScan(hx, GY, hr, hy), GY - hy, GY, COL.dgreen, .85, fo(3.6, 6.4), 40 + hx, { row: 14 }); crayon(gWax, ep(hx, GY, hr, hy, 36).filter(q => q[1] <= GY + 2), 7, COL.ind, .92, 41 + hx, { f: fo(3.0, 5.4), jit: .9 }); }
    // the cave: a big scribble with no face (it boils hard)
    hatch(gWax, ellScan(1600, GY, 130, 150), GY - 150, GY, COL.night, .96, fo(5, 6.4), 51, { row: 11 });
    { const a = fo(6, 7); if (a > 0) { const pts = []; for (let i = 0; i < 34; i++) pts.push([1600 + (hash(i * 3 + F12 * .13) - .5) * 250, GY - 150 + hash(i * 7 + F12 * .17 + 5) * 150]); crayon(gWax, pts, 8, COL.violet, .8 * a, 52, { jit: 3 }); } }
    crayon(gWax, ep(1600, GY, 130, 150, 24).filter(q => q[1] <= GY + 2), 6, COL.ind, .96, 53, { f: fo(5, 6.2) });
    // a small tree
    hatch(gWax, y => y > 560 && y < GY ? [112, 144] : null, 560, GY, COL.brown, .9, fo(6, 7.2), 61, { row: 12 }); hatch(gWax, ellScan(128, 500, 110, 96), 404, 596, COL.green, .88, fo(6.4, 8), 62, { row: 14 }); crayon(gWax, ep(128, 500, 110, 96, 24), 6, COL.ind, .9, 63, { f: fo(6.2, 7.6) });
    // the title, hand-lettered
    const ta = fo(3.8, 5.8); if (ta > 0) { gWax.save(); gWax.font = '700 150px Gaegu'; const wd = gWax.measureText('Little Bear').width; gWax.beginPath(); gWax.rect(150, 20, wd * ta + 10, 260); gWax.clip(); gWax.fillStyle = `rgba(${COL.ind},.92)`; gWax.fillText('Little Bear', 170, 210 + (F12 % 2) * 1.2); gWax.restore(); }
    // the crayon tip drawing the dusk (extreme close-up at the start)
    if (t < 6.4) { const u = fo(.5, 3.6), ty = lerp(500, GY, u), tx = SUN[0] + 90 * Math.sin(u * 40), a = 1 - ss(seg(t, 3.6, 6.2)); gWax.save(); gWax.globalAlpha = a; gWax.translate(tx + 20, ty - 4); gWax.rotate(-.9); gWax.fillStyle = `rgba(${COL.orange},1)`; gWax.beginPath(); gWax.moveTo(0, 0); gWax.lineTo(-18, -62); gWax.lineTo(18, -62); gWax.closePath(); gWax.fill(); gWax.fillStyle = 'rgba(230,214,170,1)'; gWax.fillRect(-18, -62, 36, 190); gWax.strokeStyle = `rgba(${COL.ind},1)`; gWax.lineWidth = 3; gWax.strokeRect(-18, -62, 36, 190); gWax.beginPath(); gWax.moveTo(0, 0); gWax.lineTo(-18, -62); gWax.moveTo(0, 0); gWax.lineTo(18, -62); gWax.stroke(); gWax.restore(); }
  } else if (p === 1) {
    // the night: heavy indigo crayon over the whole sheet (still: the background does not boil)
    hatch(gWax, hatchRect(-500, 3200), -160, GY, COL.night, .97, 1, 111, { row: 15 });
    hatch(gWax, hatchRect(-500, 3200), -160, GY, COL.violet, .14, 1, 112, { row: 23 });
    hatch(gWax, hatchRect(-500, 3200), GY + 6, GY + 420, COL.dgreen, .9, 1, 113, { row: 15 }); hatch(gWax, hatchRect(-500, 3200), GY + 6, GY + 420, COL.night, .45, 1, 114, { row: 22 });
    crayon(gWax, [[-500, GY], [600, GY + 6], [1700, GY - 4], [3200, GY + 3]], 7, COL.violet, .8, 115, { jit: .8, still: true });
    for (let k = 0; k < 9; k++) { const x = 330 + k * 330 + hash(k) * 60; hatch(gWax, y => y > 520 && y < GY ? [x - 14, x + 14] : null, 520, GY, COL.brown, .55, 1, 120 + k, { row: 12 }); hatch(gWax, ellScan(x, 450, 120, 108), 342, 558, COL.dgreen, .5, 1, 130 + k, { row: 14 }); crayon(gWax, ep(x, 450, 120, 108, 24), 6, COL.violet, .8, 140 + k, { jit: .9, still: true }); }
    const bx = bearX(t, 1);
    LIGHTS.forEach((it, i) => { const p = clamp((bx + 1060 - it.x) / 280) * ss(seg(t, 22.6, 24)); lightItem(gWax, it, p, t, 200 + i * 7); });
    for (let i = 0; i < 40; i++) { const x = 420 + i * 62, p = clamp((bx + 900 - x) / 200) * ss(seg(t, 22.6, 24)); lightItem(gWax, { x, y: 0, k: 4 }, p, t, 400 + i); }
  } else {
    hatch(gWax, hatchRect(-80, 2000), -60, GY, COL.night, .97, 1, 211, { row: 15 }); hatch(gWax, hatchRect(-80, 2000), -60, GY, COL.violet, .15, 1, 212, { row: 23 });
    hatch(gWax, hatchRect(-80, 2000), GY + 6, GY + 330, COL.dgreen, .9, 1, 213, { row: 15 }); crayon(gWax, [[-60, GY], [900, GY + 5], [1980, GY]], 7, COL.violet, .8, 214, { jit: .8, still: true });
    const moon = fo(40.4, 41.6); if (moon > 0) { hatch(gWax, ellScan(1560, 230, 100, 100), 130, 330, COL.yellow, .96, moon, 220, { row: 11 }); crayon(gWax, ep(1560, 230, 100, 100, 28), 7, COL.orange, .9, 221, { f: moon }); }
    BURST.forEach((b, i) => { const pr = seg(t, b.t, b.t + .4); lightItem(gWax, { x: b.x, y: b.y, k: b.k === 2 ? 0 : b.k, r: b.r }, pr, t, 300 + i, b.c); });
    for (let i = 0; i < 12; i++) lightItem(gWax, { x: 120 + i * 150, y: 0, k: 2 }, seg(t, 40.2 + i * .08, 40.7 + i * .08), t, 600 + i);
  }
  drawBear(gChar, gMask, t, bearState(t, p));
}
function drawSubs(t, g2 = gChar, m2 = gMask) {
  for (const g of [g2, m2]) g.setTransform(1, 0, 0, 1, 0, 0);
  for (const v of VOICE) {
    const t1 = subEnd(v); if (t < v.t - .05 || t > t1) continue; if (turnAt(t) >= 0) continue; const pp = seg(t, v.t, v.t + .35);
    g2.font = '54px Patrick'; const words = v.text.split(' '); let l1 = v.text, l2 = ''; if (g2.measureText(v.text).width > 1500) { let best = 1e9; for (let i = 3; i < words.length - 2; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), d = Math.abs(g2.measureText(a).width - g2.measureText(b).width); if (d < best) { best = d; l1 = a; l2 = b; } } }
    const lines = l2 ? [l1, l2] : [l1], y0 = 1000 - (lines.length - 1) * 62, wmax = Math.max(...lines.map(l => g2.measureText(l).width));
    const bx = W / 2 - wmax / 2 - 50, bw = wmax + 100, by = y0 - 62, bh = lines.length * 62 + 36;
    m2.fillStyle = '#000'; m2.beginPath(); const r = mulberry(17); m2.moveTo(bx, by); for (let x = bx; x <= bx + bw; x += 30) m2.lineTo(x, by + (r() - .5) * 14); for (let y = by; y <= by + bh; y += 30) m2.lineTo(bx + bw + (r() - .5) * 14, y); for (let x = bx + bw; x >= bx; x -= 30) m2.lineTo(x, by + bh + (r() - .5) * 14); for (let y = by + bh; y >= by; y -= 30) m2.lineTo(bx + (r() - .5) * 14, y); m2.closePath(); m2.fill();
    lines.forEach((ln, li) => { g2.save(); const lw = g2.measureText(ln).width; g2.beginPath(); g2.rect(W / 2 - lw / 2 - 20, y0 - 60 + li * 62, (lw + 40) * pp, 90); g2.clip(); let x = W / 2 - lw / 2; for (const chn of ln) { const cw = g2.measureText(chn).width, j1 = hash(x + F12 * 3.1), j2 = hash(x * 1.7 + F12 * 5.3); g2.save(); g2.translate(x + cw / 2, y0 + li * 62 + (j2 - .5) * 5); g2.rotate((j1 - .5) * .09); g2.fillStyle = `rgba(${COL.ind},.95)`; g2.textAlign = 'center'; g2.fillText(chn, 0, 0); g2.restore(); x += cw; } g2.restore(); });
  }
}

/* ------------------------------------------------------------------ compositor: wax adhesion + paper knock-out */
const OUT = gPage.createImageData(W, H);
function cov(a, tooth) { if (a < .02) return 0; const th = 1 - a * 1.14, v = (tooth - th) * 8 + .5; return v < 0 ? 0 : v > 1 ? 1 : v; }
function composite(ox, oy) {
  const wax = gWax.getImageData(0, 0, W, H).data, chr = gChar.getImageData(0, 0, W, H).data, msk = gMask.getImageData(0, 0, W, H).data, o = OUT.data;
  for (let y = 0; y < H; y++) {
    const ry = ((y + oy) & (TW - 1)) * TW, vy = ((y - 540) / 540) ** 2;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4, ti = ry + ((x + ox) & (TW - 1)), tooth = TOOTH[ti], pl = PAPERL[ti], vg = 1 - .055 * (((x - 960) / 960) ** 2 * .5 + vy * .5);
      const br = pl * .998 * vg, bg = pl * .962 * vg, bb = pl * .90 * vg; let r = br, g = bg, b = bb;
      const aw = wax[p + 3]; if (aw) { const cw = cov(aw / 255, tooth) * .96; if (cw > 0) { r += (wax[p] - r) * cw; g += (wax[p + 1] - g) * cw; b += (wax[p + 2] - b) * cw; } }
      const m = msk[p + 3]; if (m) { const k = m / 255; r += (br - r) * k; g += (bg - g) * k; b += (bb - b) * k; }
      const ac = chr[p + 3]; if (ac) { const c = cov(ac / 255, tooth) * .97; if (c > 0) { r += (chr[p] - r) * c; g += (chr[p + 1] - g) * c; b += (chr[p + 2] - b) * c; } }
      o[p] = r; o[p + 1] = g; o[p + 2] = b; o[p + 3] = 255;
    }
  }
  gPage.putImageData(OUT, 0, 0);
}
function renderPage(t, p, subs) {
  JM = boilAt(t, p); const c = camAt(t, p); drawPage(t, p, c); if (subs) drawSubs(t);
  composite(Math.round(c.cx - W / 2), Math.round(c.cy - H / 2));
}
/* ------------------------------------------------------------------ page turn, fridge */
const cOld = mk(), gOld = cOld.getContext('2d');
function drawTurn(u) {
  const th = u * Math.PI / 2, cs = Math.cos(th), w = W * cs;
  const gr = ctx.createLinearGradient(w, 0, w + 220, 0); gr.addColorStop(0, `rgba(30,18,6,${.42 * Math.sin(th)})`); gr.addColorStop(1, 'rgba(30,18,6,0)'); ctx.fillStyle = gr; ctx.fillRect(w, 0, 240, H);
  for (let x = 0; x < W; x += 8) { const dx = x * cs, tp = 1 + .035 * Math.sin(th) * (x / W); ctx.drawImage(cOld, x, 0, 8, H, dx, -H * (tp - 1) / 2, 8 * cs + 1.2, H * tp); }
  ctx.fillStyle = `rgba(0,0,0,${.28 * Math.sin(th)})`; ctx.fillRect(0, 0, w, H);
  ctx.fillStyle = `rgba(255,248,225,${.4 * Math.sin(th)})`; ctx.fillRect(w - 5, 0, 5, H);
}
function crayonRect(g, x, y, w, h, col, seed) { g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); const r = mulberry(seed); g.moveTo(x + r() * 3, y + r() * 3); g.lineTo(x + w + r() * 3, y + r() * 3); g.lineTo(x + w + r() * 3, y + h + r() * 3); g.lineTo(x + r() * 3, y + h + r() * 3); g.closePath(); g.stroke(); }
function miniDrawing(x, y, w, h, kind, rot) {
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = 'rgba(30,20,10,.3)'; ctx.fillRect(6, 8, w, h); ctx.fillStyle = '#f4efe0'; ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineWidth = 6;
  if (kind === 0) { ctx.fillStyle = '#f0c030'; ctx.beginPath(); ctx.arc(w * .75, h * .25, 26, 0, TAU); ctx.fill(); ctx.fillStyle = '#c4622f'; ctx.fillRect(w * .15, h * .55, w * .45, h * .3); ctx.strokeStyle = '#8a3a22'; ctx.beginPath(); ctx.moveTo(w * .1, h * .55); ctx.lineTo(w * .375, h * .35); ctx.lineTo(w * .65, h * .55); ctx.stroke(); }
  else if (kind === 1) { ctx.strokeStyle = '#4aa24a'; ctx.beginPath(); ctx.moveTo(w * .5, h * .9); ctx.lineTo(w * .5, h * .4); ctx.stroke(); ctx.fillStyle = '#e8648a'; for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.arc(w * .5 + Math.cos(a * 1.05) * 24, h * .35 + Math.sin(a * 1.05) * 24, 14, 0, TAU); ctx.fill(); } ctx.fillStyle = '#f0c030'; ctx.beginPath(); ctx.arc(w * .5, h * .35, 12, 0, TAU); ctx.fill(); }
  else { for (let i = 0; i < 4; i++) { ctx.strokeStyle = ['#e8483a', '#f09030', '#f0d040', '#4aa24a'][i]; ctx.beginPath(); ctx.arc(w * .5, h * .85, w * .38 - i * 14, Math.PI, 0); ctx.stroke(); } }
  ctx.restore();
}
function drawFridge(k, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#e8dfc0'; ctx.fillRect(0, 0, W, H);
  const r = mulberry(8); for (let i = 0; i < 70; i++) { ctx.fillStyle = r() < .5 ? 'rgba(120,90,40,.05)' : 'rgba(255,255,240,.12)'; ctx.fillRect(r() * W, r() * H, 60 + r() * 140, 2 + r() * 4); }
  // the fridge door
  ctx.fillStyle = 'rgba(40,30,15,.25)'; ctx.fillRect(110, -10, 1720, H + 40);
  const fg = ctx.createLinearGradient(90, 0, 1800, 0); fg.addColorStop(0, '#d3dde0'); fg.addColorStop(.5, '#e2eaec'); fg.addColorStop(1, '#cbd6d9'); ctx.fillStyle = fg; ctx.fillRect(90, -20, 1720, H + 40);
  ctx.fillStyle = '#9aa6aa'; ctx.beginPath(); ctx.roundRect(150, 200, 24, 520, 12); ctx.fill(); ctx.fillStyle = '#b8c3c6'; ctx.fillRect(90, 500, 1720, 5);
  miniDrawing(210, 90, 250, 330, 0, -.05); miniDrawing(1470, 120, 250, 320, 1, .06); miniDrawing(250, 600, 270, 300, 2, .04);
  // our page, taped up
  const w = W * k, h = H * k, x = W / 2 - w / 2 + 20, y = H / 2 - h / 2 - 10;
  ctx.fillStyle = 'rgba(30,18,6,.35)'; ctx.fillRect(x + 10, y + 14, w, h); ctx.drawImage(cPage, x, y, w, h);
  ctx.fillStyle = 'rgba(240,226,170,.8)'; for (const [tx, ty, rot] of [[x - 30, y - 4, -.5], [x + w - 70, y - 8, .4], [x - 24, y + h - 36, .5], [x + w - 80, y + h - 34, -.4]]) { ctx.save(); ctx.translate(tx + 50, ty + 20); ctx.rotate(rot); ctx.fillRect(-50, -20, 100, 40); ctx.restore(); }
  for (const [mx, my, c] of [[1560, 620, '#e8483a'], [260, 520, '#4a8ae8'], [1650, 560, '#f0c030']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(mx, my, 26, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3; ctx.stroke(); }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .5, W / 2, H / 2, H); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,25,0,.25)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}
function fridgeSub(t) {
  const v = VOICE[7], a = ss(seg(t, v.t, v.t + .3)) * (1 - ss(seg(t, subEnd(v), subEnd(v) + .3))); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.font = '54px Patrick'; const w = ctx.measureText(v.text).width; ctx.fillStyle = '#f4efe0'; const r = mulberry(3); ctx.beginPath(); ctx.moveTo(W / 2 - w / 2 - 50, 930); for (let x = W / 2 - w / 2 - 50; x <= W / 2 + w / 2 + 50; x += 30) ctx.lineTo(x, 930 + (r() - .5) * 10); ctx.lineTo(W / 2 + w / 2 + 50, 1030); for (let x = W / 2 + w / 2 + 50; x >= W / 2 - w / 2 - 50; x -= 30) ctx.lineTo(x, 1030 + (r() - .5) * 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(${COL.ind},.95)`; ctx.textAlign = 'center'; ctx.fillText(v.text, W / 2, 996); ctx.restore();
}
let READY = false;
function render(t) {
  if (!READY) return;
  F12 = Math.floor(t * 12);
  const tk = turnAt(t), fr = t >= 49.6;
  if (tk >= 0) { renderPage(t, tk, false); gOld.drawImage(cPage, 0, 0); renderPage(t, tk + 1, false); }
  else renderPage(t, pageOf(t), !fr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fr) { drawFridge(lerp(1, .5, eio(seg(t, 49.6, 55.6))), t); fridgeSub(t); }
  else { ctx.drawImage(cPage, 0, 0); if (tk >= 0) drawTurn(eio(seg(t, TURNS[tk][0], TURNS[tk][1]))); }
}
window.render = render;
window.TEXTS = t => (t > 5.9 && t < 17.8 ? [{ id: 'title', text: 'Little Bear', x0: 150, y0: 50, x1: 760, y1: 240 }] : []);
function buildEV() {
  const ev = []; VOICE.forEach(v => ev.push({ t: v.t, type: 'voice', id: v.id }));
  for (let t = .5; t < 3.6; t += .32) ev.push({ t: +t.toFixed(2), type: 'cstroke' });
  for (let t = 3.4; t < 8; t += .55) ev.push({ t: +t.toFixed(2), type: 'swish' });
  ev.push({ t: 7.2, type: 'steps', d: 3.8 }, { t: 14.2, type: 'steps', d: 2.2 }, { t: 23.4, type: 'steps', d: 13.6 }, { t: 14.6, type: 'rustle' });
  for (let t = 11; t < 18; t += .45) ev.push({ t: +t.toFixed(2), type: 'scribble' });
  TURNS.forEach(([a, b], i) => ev.push({ t: a, type: 'turn', d: b - a, i }));
  const seen = {}; for (let t = 22.6; t < 37.4; t += 1 / 24) { const bx = bearX(t, 1); LIGHTS.forEach((it, i) => { const p = clamp((bx + 1060 - it.x) / 280) * ss(seg(t, 22.6, 24)); if (p > .05 && !seen[i]) { seen[i] = 1; ev.push({ t: +t.toFixed(2), type: 'light', k: it.k, pan: clamp((it.x - bx - 330) / 700, -1, 1) }); } }); }
  BURST.forEach((b, i) => { if (i % 3 === 0) ev.push({ t: +b.t.toFixed(2), type: 'burst', k: i }); });
  ev.push({ t: 38.9, type: 'whoosh' }, { t: 49.6, type: 'slide' }, { t: 55.6, type: 'tape' });
  return ev.sort((a, b) => a.t - b.t);
}
async function init() {
  await Promise.all(['54px Patrick', '700 150px Gaegu'].map(f => document.fonts.load(f)));
  makeTooth(); READY = true; window.EV = buildEV(); window.READY = true;
}
init();
