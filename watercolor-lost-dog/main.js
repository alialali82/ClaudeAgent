import { clamp, lerp, seg, ss, eio, eo, mulberry, vnoise, hash, TAU } from '/core/lib.js';

const W = 1920, H = 1080, DUR = 60;
window.DUR = DUR;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');

/* ------------------------------------------------------------------ timeline */
const VOICE = [
  { id: 'v1', t: 2.2, d: 1.831, text: 'The dog did not know the way.' },
  { id: 'v2', t: 9.2, d: 3.931, text: 'So he followed the rain, past the market, where every street looked the same.' },
  { id: 'v3', t: 17.3, d: 2.614, text: 'Past the bridge, where the river kept its secrets.' },
  { id: 'v4', t: 24.0, d: 2.683, text: 'Past the hour when even the lamps forget your name.' },
  { id: 'v5', t: 41.8, d: 2.855, text: 'Then, under all that cold, a small warm smell.' },
  { id: 'v6', t: 47.2, d: 1.813, text: 'Bread. Wool. A door he knew.' },
  { id: 'v7', t: 54.0, d: 2.095, text: 'He was never lost. Only far.' },
];
window.VOICE = VOICE;
const hold = v => Math.max(1.8, v.d + .6, v.text.length / 15 + 1.5);
const STOP_X = 4850;

function dogX(t) {
  if (t < 7) return 0;
  if (t < 32) return (t - 7) * 120;
  if (t < 41) return 3000 + (t - 32) * 45;
  if (t < 52) return 3405 + (t - 41) * 120;
  return 4725 + (STOP_X - 4725) * ss(seg(t, 52, 55.6));
}
const mood = t => ss(seg(t, 37, 44)); // 0 cold .. 1 warm
const zoomAt = t => t < 3.2 ? 2.5 : t < 7.6 ? lerp(2.5, 1, eio(seg(t, 3.2, 7.6))) : t < 50 ? 1 : lerp(1, 2.45, eio(seg(t, 50, 58.5)));
const axAt = t => t < 3.2 ? 960 : t < 7.6 ? lerp(960, 640, eio(seg(t, 3.2, 7.6))) : t < 50 ? 640 : lerp(640, 780, eio(seg(t, 50, 58.5)));
const gyAt = t => { const z = zoomAt(t); return lerp(720, 905, clamp((z - 1) / 1.5)); };

/* ------------------------------------------------------------------ colour */
const hex = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const dark = (c, k = .72) => [c[0] * k, c[1] * k, c[2] * k];
const PAPER = hex('#f3ead6'), INK = hex('#4a4350'), BROWN = hex('#6b4a2f');
function keyCol(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) if (t < keys[i + 1][0]) { const u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); return mixc(keys[i][1], keys[i + 1][1], ss(u)); }
  return keys[keys.length - 1][1];
}
const SKY = [[7, hex('#b9c4ce')], [20, hex('#9aabbd')], [28, hex('#62779b')], [33, hex('#46587a')]].map(k => [k[0], k[1]]);
const GRD = [[7, hex('#9a9fa4')], [20, hex('#808a97')], [28, hex('#4f5a70')], [33, hex('#3e4860')]];

/* ------------------------------------------------------------------ paper */
let paper;
function makePaper() {
  const PW = 2304, PH = 1400, c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const g = c.getContext('2d'), img = g.createImageData(PW, PH), d = img.data, rnd = mulberry(11);
  const oct = [[96, .028], [32, .024], [8, .016]].map(([cell, amp]) => {
    const nx = PW / cell, ny = Math.ceil(PH / cell) + 2, L = new Float32Array(nx * ny);
    for (let i = 0; i < L.length; i++) L[i] = rnd();
    return { cell, amp, nx, ny, L };
  });
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    let v = 0;
    for (const o of oct) {
      const fx = x / o.cell, fy = y / o.cell, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
      const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const a = o.L[iy * o.nx + ix % o.nx], b = o.L[iy * o.nx + (ix + 1) % o.nx], cc = o.L[(iy + 1) * o.nx + ix % o.nx], dd = o.L[(iy + 1) * o.nx + (ix + 1) % o.nx];
      v += ((a + (b - a) * sx) * (1 - sy) + (cc + (dd - cc) * sx) * sy - .5) * 2 * o.amp;
    }
    v += (rnd() - .5) * .018;
    const k = 1 + v, p = (y * PW + x) * 4;
    d[p] = Math.min(255, PAPER[0] * k); d[p + 1] = Math.min(255, PAPER[1] * k); d[p + 2] = Math.min(255, PAPER[2] * k); d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * PW, y = rnd() * PH, a = rnd() * TAU, l = 6 + rnd() * 22, bend = (rnd() - .5) * 9;
    g.strokeStyle = rnd() < .6 ? 'rgba(110,90,60,.07)' : 'rgba(255,255,250,.10)'; g.lineWidth = .8;
    for (const off of [0, -PW, PW]) { g.beginPath(); g.moveTo(x + off, y); g.quadraticCurveTo(x + off + Math.cos(a) * l / 2 + bend, y + Math.sin(a) * l / 2, x + off + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  }
  return c;
}

/* ------------------------------------------------------------------ stroke engine */
const PROF = {
  brush: u => Math.min(1, u * 5 + .25) * Math.min(1, (1 - u) * 3.2 + .15) * (.82 + .36 * Math.sin(u * 3.14)),
  even: u => Math.min(1, u * 9 + .35) * Math.min(1, (1 - u) * 9 + .35),
  tip: u => Math.min(1, u * 6 + .2) * (1 - u * .88),
  leaf: u => Math.pow(Math.sin(Math.PI * clamp(u, .03, .97)), .7),
  trunk: u => .55 + .45 * (1 - u),
};
function smooth(pts, step) {
  const n = pts.length, out = [];
  if (n < 3) { const a = pts[0], b = pts[n - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(2, Math.ceil(L / step)); for (let i = 0; i <= m; i++) out.push([lerp(a[0], b[0], i / m), lerp(a[1], b[1], i / m)]); return out; }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(pts[n - 1]); return out;
}
function mk(pts, o, rng) {
  const S = smooth(pts, o.step || 11), n = S.length, w0 = o.w || 12, pf = PROF[o.prof || 'brush'], sd = rng() * 60;
  const X = new Float32Array(n), Y = new Float32Array(n), NX = new Float32Array(n), NY = new Float32Array(n), WV = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const u = i / (n - 1); X[i] = S[i][0]; Y[i] = S[i][1]; NX[i] = -ty; NY[i] = tx; WV[i] = w0 * pf(u) * (1 + .46 * (vnoise(sd + u * 7) - .5));
  }
  const c = o.col, a = o.a ?? .55, nb = o.nb ?? Math.round(2 + w0 / 9), br = [];
  for (let i = 0; i < nb; i++) br.push({ u: -.42 + .84 * rng(), a: .3 + .5 * rng(), pat: [3 + rng() * 14, 2 + rng() * 11], end: .55 + .45 * rng(), lw: .8 + rng() * 1.3 });
  return { n, X, Y, NX, NY, WV, fill: rgba(c, nb ? a * .8 : a), bc: dark(c, .78), br, a };
}
function drawS(s, f) {
  if (f <= 0) return;
  const m = Math.max(2, Math.min(s.n, Math.ceil(f * (s.n - 1)) + 1));
  ctx.fillStyle = s.fill; ctx.beginPath();
  for (let i = 0; i < m; i++) ctx.lineTo(s.X[i] + s.NX[i] * s.WV[i] * .5, s.Y[i] + s.NY[i] * s.WV[i] * .5);
  for (let i = m - 1; i >= 0; i--) ctx.lineTo(s.X[i] - s.NX[i] * s.WV[i] * .5, s.Y[i] - s.NY[i] * s.WV[i] * .5);
  ctx.closePath(); ctx.fill();
  for (const b of s.br) {
    const e = Math.min(m, Math.floor(b.end * s.n) + 1); if (e < 2) continue;
    ctx.strokeStyle = rgba(s.bc, b.a * Math.min(1, s.a + .25)); ctx.lineWidth = b.lw; ctx.setLineDash(b.pat); ctx.beginPath();
    for (let i = 0; i < e; i++) ctx.lineTo(s.X[i] + s.NX[i] * s.WV[i] * b.u, s.Y[i] + s.NY[i] * s.WV[i] * b.u);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
function drawList(list, p) {
  const n = list.length;
  for (let i = 0; i < n; i++) { const st = i / (n + 2), f = clamp((p - st) / (2 / (n + 2))); if (f > 0) drawS(list[i], f); }
}

/* ------------------------------------------------------------------ world objects */
const objs = [];
const LAYERS = { far: { f: .5, sc: .55, y: -118 }, mid: { f: .8, sc: .8, y: -42 }, main: { f: 1, sc: 1, y: 0 }, fg: { f: 1.3, sc: 1.25, y: 40 } };
function add(x, layer, warm, list, o = {}) { objs.push({ x, L: LAYERS[layer], layer, warm, list, w: o.w || 300, cap: o.cap ?? 1, tag: o.tag || '' }); }
const washBlock = (x0, y0, x1, y1, col, a, rng, rows) => {
  const out = [], h = y1 - y0;
  for (let i = 0; i < rows; i++) { const y = y0 + (i + .5) * h / rows; out.push(mk([[x0 - 3 + rng() * 6, y], [(x0 + x1) / 2, y + (rng() - .5) * 4], [x1 + 3 - rng() * 6, y + (rng() - .5) * 3]], { w: h / rows * 1.55, col, a, prof: 'even', nb: 2 }, rng)); }
  return out;
};
const line = (pts, w, col, a, rng, prof = 'even', nb = 1) => mk(pts, { w, col, a, prof, nb }, rng);

function building(rng, w, h, col, lit, wins = true) {
  const L = [];
  L.push(...washBlock(0, -h, w, 0, col, .6, rng, Math.ceil(h / 55)));
  L.push(...washBlock(0, -h, w * .45, 0, dark(col, .86), .22, rng, Math.ceil(h / 80)));
  L.push(line([[0, 0], [1, -h * .5], [-1, -h]], 3.4, INK, .55, rng), line([[w, 0], [w - 1, -h * .5], [w + 1, -h]], 3.4, INK, .5, rng));
  L.push(line([[-6, -h], [w * .5, -h - 4], [w + 6, -h + 2]], 4, INK, .6, rng));
  if (wins) {
    const cols = Math.max(2, Math.floor(w / 62)), rows = Math.floor((h - 70) / 74);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = 24 + c * (w - 48) / Math.max(1, cols - 1 || 1), y = -h + 36 + r * 74, isLit = rng() < lit;
      L.push(mk([[x, y], [x, y + 34]], { w: 22, col: isLit ? hex('#e8bf6c') : hex('#566179'), a: isLit ? .78 : .42, prof: 'even', nb: 0 }, rng));
    }
  }
  return L;
}
function lamp(rng) {
  return [line([[0, 0], [1, -100], [-1, -200]], 7, INK, .65, rng, 'trunk'), line([[0, -200], [20, -212], [36, -204]], 5, INK, .6, rng),
    mk([[34, -202], [36, -198]], { w: 30, col: hex('#e0b25a'), a: .8, prof: 'even', nb: 0, step: 3 }, rng),
    mk([[36, -200], [38, -196]], { w: 74, col: hex('#f0d089'), a: .22, prof: 'even', nb: 0, step: 3 }, rng)];
}
function stall(rng, c1) {
  const L = [line([[0, 0], [0, -120]], 7, BROWN, .6, rng), line([[150, 0], [150, -120]], 7, BROWN, .6, rng)];
  for (let i = 0; i < 6; i++) L.push(mk([[i * 25 + 4, -150], [i * 25 + 8, -108]], { w: 26, col: i % 2 ? c1 : hex('#d8cdb0'), a: .6, prof: 'even', nb: 2 }, rng));
  L.push(line([[-8, -150], [75, -158], [160, -150]], 4, INK, .55, rng));
  L.push(...washBlock(8, -48, 142, -34, BROWN, .5, rng, 2));
  for (let i = 0; i < 5; i++) L.push(mk([[22 + i * 24, -62], [24 + i * 24, -50]], { w: 18, col: [hex('#9db16a'), hex('#c9a75a'), hex('#a8745a')][i % 3], a: .65, prof: 'even', nb: 0 }, rng));
  return L;
}
function bridgeObj(rng) {
  const L = [];
  L.push(line([[-460, -4], [0, -10], [470, -4]], 20, hex('#8d8f98'), .55, rng, 'even', 3));
  L.push(line([[-460, -64], [0, -70], [470, -64]], 7, INK, .6, rng));
  for (let i = -11; i <= 11; i++) L.push(line([[i * 41, -8], [i * 41, -62]], 5, INK, .5, rng, 'even', 0));
  for (const x0 of [-300, 0, 300]) L.push(mk([[x0 - 135, 118], [x0 - 70, 52], [x0, 26], [x0 + 70, 52], [x0 + 135, 118]], { w: 22, col: hex('#7f8590'), a: .55, prof: 'even', nb: 3, step: 8 }, rng));
  for (const x0 of [-440, -150, 150, 440]) L.push(line([[x0, 10], [x0, 160]], 28, hex('#757b88'), .5, rng, 'even', 3));
  return L;
}
function river(rng) {
  const L = [];
  for (let i = 0; i < 8; i++) {
    const y = 100 + i * 17, c = mixc(hex('#7f98b6'), hex('#4d6385'), i / 8);
    const e0 = 470 + rng() * 260; L.push(mk([[-e0, y], [0, y + (rng() - .5) * 9], [e0 + rng() * 80, y]], { w: 40, col: c, a: .42, prof: 'even', nb: 3 }, rng));
  }
  for (let i = 0; i < 10; i++) { const x = -450 + rng() * 900, y = 150 + rng() * 200; L.push(line([[x, y], [x + 60 + rng() * 60, y + 2]], 3, hex('#e9eef2'), .5, rng, 'tip', 0)); }
  return L;
}
function tree(rng, cols, big = 1) {
  const L = [line([[0, 0], [3, -80 * big], [-2, -150 * big]], 22 * big, BROWN, .7, rng, 'trunk', 3)];
  L.push(line([[0, -110 * big], [-40 * big, -160 * big]], 9 * big, BROWN, .6, rng, 'tip', 1), line([[2, -120 * big], [46 * big, -168 * big]], 9 * big, BROWN, .6, rng, 'tip', 1));
  for (let i = 0; i < 30; i++) {
    const a = rng() * TAU, r = (30 + rng() * 70) * big, cx = Math.cos(a) * r * 1.1, cy = -200 * big + Math.sin(a) * r * .8, d = a + 1.2;
    L.push(mk([[cx - Math.cos(d) * 24 * big, cy - Math.sin(d) * 24 * big], [cx, cy], [cx + Math.cos(d) * 24 * big, cy + Math.sin(d) * 24 * big]], { w: 30 * big, col: cols[Math.floor(rng() * cols.length)], a: .5, prof: 'leaf', nb: 1, step: 8 }, rng));
  }
  return L;
}
function fence(rng, n) {
  const L = [line([[0, -40], [n * 70, -44]], 7, BROWN, .6, rng), line([[0, -22], [n * 70, -25]], 7, BROWN, .6, rng)];
  for (let i = 0; i <= n; i++) L.push(line([[i * 70, 2], [i * 70 + 1, -62]], 10, hex('#7c5d3d'), .7, rng, 'tip', 2));
  return L;
}
function grass(rng, cols) {
  const L = []; for (let i = 0; i < 9; i++) { const x = (i - 4) * 9; L.push(mk([[x, 0], [x + (rng() - .5) * 14, -24 - rng() * 22], [x + (rng() - .3) * 26, -46 - rng() * 22]], { w: 6, col: cols[i % cols.length], a: .6, prof: 'tip', nb: 0, step: 8 }, rng)); } return L;
}
function house(rng) {
  const L = [];
  L.push(...washBlock(-168, -230, 168, 0, hex('#f6ead0'), .95, rng, 7), ...washBlock(-170, -230, 170, 0, hex('#f1dcb2'), .3, rng, 6), ...washBlock(-170, -230, -90, 0, hex('#d7b988'), .3, rng, 4));
  L.push(line([[-170, 0], [-171, -115], [-170, -230]], 4, INK, .6, rng), line([[170, 0], [171, -115], [170, -230]], 4, INK, .5, rng), line([[-174, 0], [0, 4], [174, 0]], 4, INK, .55, rng));
  for (let i = 0; i < 9; i++) L.push(mk([[-205 + i * 6, -228 - i * 12], [0, -312 + i * 3 - i * 4], [205 - i * 6, -228 - i * 12]], { w: 36, col: hex('#b4573b'), a: .55, prof: 'even', nb: 2 }, rng));
  L.push(line([[-210, -228], [0, -322], [210, -228]], 5, INK, .62, rng));
  L.push(mk([[110, -300], [110, -392]], { w: 36, col: hex('#a65d45'), a: .7, prof: 'even', nb: 2 }, rng));
  L.push(line([[110, -394], [118, -460], [96, -520], [120, -590]], 16, hex('#c8c3c0'), .4, rng, 'tip', 2));
  L.push(mk([[-92, -150], [-92, -96]], { w: 74, col: hex('#f6cf72'), a: .85, prof: 'even', nb: 0 }, rng), line([[-130, -158], [-54, -158], [-54, -88], [-130, -88], [-130, -158]], 4, INK, .55, rng), line([[-92, -158], [-92, -88]], 3, INK, .5, rng));
  L.push(mk([[0, -4], [0, -128]], { w: 74, col: hex('#7a4a2b'), a: .78, prof: 'even', nb: 3 }, rng), line([[-38, 0], [-38, -134], [38, -134], [38, 0]], 5, INK, .6, rng));
  L.push(mk([[24, -62], [25, -60]], { w: 9, col: hex('#d4a64a'), a: .9, prof: 'even', nb: 0, step: 2 }, rng));
  return L;
}
function skyline(rng, n, col) {
  const L = []; let x = 0; for (let i = 0; i < n; i++) { const w = 150 + rng() * 120, h = 160 + rng() * 260; for (const s of building(rng, w, h, col, 0, false)) L.push(Object.assign(s, {})); x += w; /* local placement via sub-objects below */ }
  return L;
}

function buildWorld() {
  const R = s => mulberry(s);
  const coolA = hex('#8a97a6'), coolB = hex('#9a9aa6'), coolC = hex('#a8a090');
  // far skyline (cold)
  [[100, 190, 330, coolA], [330, 150, 250, coolB], [520, 220, 380, coolA], [800, 170, 300, coolC], [1020, 200, 420, coolA], [1300, 160, 280, coolB], [1520, 240, 360, coolA], [1820, 170, 300, coolC], [2150, 220, 400, coolA], [2420, 170, 260, coolB]]
    .forEach(([x, w, h, c], i) => add(x, 'far', false, building(R(100 + i), w, h, c, 0, false), { w: w + 40 }));
  // mid buildings (cold)
  [[400, 250, 380, hex('#7d8aa0')], [720, 290, 480, hex('#a09484')], [1090, 230, 420, hex('#778599')], [1420, 300, 500, hex('#9a8f84')], [1780, 250, 400, hex('#7d8aa0')]]
    .forEach(([x, w, h, c], i) => add(x, 'mid', false, building(R(200 + i), w, h, c, .22 + .04 * i), { w: w + 40 }));
  // main street
  add(600, 'main', false, lamp(R(301)), { w: 100 }); add(1210, 'main', false, lamp(R(302)), { w: 100 }); add(1760, 'main', false, lamp(R(303)), { w: 100 });
  add(860, 'main', false, stall(R(311), hex('#8a9fb0')), { w: 200 }); add(1480, 'main', false, stall(R(312), hex('#b5a37c')), { w: 200 });
  add(2400, 'main', false, bridgeObj(R(320)), { w: 1000, tag: 'bridge' });
  add(2400, 'main', false, river(R(321)), { w: 1100, tag: 'river' });
  for (let i = 0; i < 16; i++) { const r = R(900 + i); add(300 + i * 170 + r() * 60, 'main', false, [mk([[0, 30 + r() * 90], [70 + r() * 60, 32 + r() * 90]], { w: 14 + r() * 8, col: hex('#7f93ad'), a: .34, prof: 'even', nb: 1 }, r)], { w: 180 }); }
  add(2000, 'main', false, lamp(R(304)), { w: 100 }); add(2800, 'main', false, lamp(R(305)), { w: 100 });
  // warm: far hills as trees, mid trees, main fence, trees, grass, house
  [3700, 4000, 4300, 4650, 4950].forEach((x, i) => add(x, 'far', true, tree(R(400 + i), [hex('#a7ae6a'), hex('#c9b46a'), hex('#8c9a5c')], 1.25), { w: 260 }));
  [3780, 4180, 4560].forEach((x, i) => add(x, 'mid', true, tree(R(420 + i), [hex('#9fae62'), hex('#d1b45f'), hex('#7f9455')], 1.5), { w: 300 }));
  add(3650, 'main', true, fence(R(500), 7), { w: 560 }); add(4350, 'main', true, fence(R(501), 4), { w: 340 });
  [3900, 4430].forEach((x, i) => add(x, 'main', true, tree(R(510 + i), [hex('#8fa65a'), hex('#d9b95a'), hex('#b8a24c'), hex('#6f8f4e')], 1.7), { w: 380 }));
  for (let i = 0; i < 12; i++) add(3600 + i * 105 + (hash(i) * 30), 'main', true, grass(R(600 + i), [hex('#7f9a4e'), hex('#a3b45e'), hex('#c8b75b')]), { w: 120 });
  add(5000, 'main', true, house(R(700)), { w: 460, tag: 'house' });
  [4700, 4800].forEach((x, i) => add(x, 'fg', true, grass(R(720 + i), [hex('#6f8f4e'), hex('#a3b45e')]), { w: 140 }));
}

/* ------------------------------------------------------------------ dog */
const dogCols = { body: hex('#a77a4a'), shade: hex('#6e4a2a'), ear: hex('#5b3a22'), light: hex('#d8bd8e'), tag: hex('#c8442a') };
function dogStrokes(t) {
  const m = mood(t), x = dogX(t), moving = t > 7 && !(t >= 36 && t < 41 && false) && (x < STOP_X - 1.5);
  const sp = dogSpeed(t), ph = x / 76, rng = mulberry(77), L = [];
  const droop = lerp(16, -6, m) + (t < 7 ? Math.sin(t * 1.1) * 4 : 0), bob = moving ? Math.sin(ph * TAU * 2) * 1.6 : Math.sin(t * 1.8) * 1.2;
  const wag = Math.sin(t * lerp(3, 12, m)) * lerp(.15, 1, m) * (t > 44 ? 1 : .35);
  const legs = (hx, sw) => { const a = sw * 24 * (moving ? 1 : .15); const lf = Math.max(0, -sw) * 14 * (moving ? 1 : 0); return [[hx, -48 + bob], [hx + a * .45, -26 + bob * .5 - lf * .3], [hx + a, -lf]]; };
  const s1 = Math.sin(ph * TAU), s2 = Math.sin(ph * TAU + Math.PI);
  // far-side legs first (darker, behind)
  L.push(mk(legs(-30, s1), { w: 10, col: dogCols.shade, a: .74, prof: 'even', nb: 1, step: 5 }, rng));
  L.push(mk(legs(26, s2), { w: 10, col: dogCols.shade, a: .74, prof: 'even', nb: 1, step: 5 }, rng));
  // tail
  const tailUp = lerp(-16, -74, m);
  L.push(mk([[-50, -66 + bob], [-70, -62 + tailUp * .4 + bob], [-80 + wag * 14, -62 + tailUp + bob]], { w: 17, col: dogCols.body, a: .72, prof: 'leaf', nb: 2, step: 7 }, rng));
  // body
  L.push(mk([[-54, -58 + bob], [-24, -76 + bob], [22, -76 + bob], [48, -66 + bob]], { w: 40, col: dogCols.body, a: .66, prof: 'brush', nb: 5, step: 6 }, rng));
  L.push(mk([[-46, -52 + bob], [0, -58 + bob], [40, -54 + bob]], { w: 22, col: dogCols.shade, a: .35, prof: 'brush', nb: 2, step: 8 }, rng));
  L.push(mk([[-14, -64 + bob], [10, -66 + bob], [30, -62 + bob]], { w: 20, col: dogCols.light, a: .38, prof: 'brush', nb: 1, step: 8 }, rng));
  // near legs
  L.push(mk(legs(-38, s2), { w: 11, col: dogCols.body, a: .84, prof: 'even', nb: 1, step: 5 }, rng));
  L.push(mk(legs(34, s1), { w: 11, col: dogCols.body, a: .84, prof: 'even', nb: 1, step: 5 }, rng));
  // neck + head
  L.push(mk([[40, -70 + bob], [58, -82 + droop * .5 + bob]], { w: 34, col: dogCols.body, a: .65, prof: 'even', nb: 2, step: 8 }, rng));
  const hy = -92 + droop + bob;
  L.push(mk([[54, hy + 2], [72, hy - 3], [88, hy + 6]], { w: 42, col: dogCols.body, a: .7, prof: 'brush', nb: 3, step: 7 }, rng));
  L.push(mk([[78, hy + 9], [102, hy + 14]], { w: 22, col: dogCols.light, a: .55, prof: 'even', nb: 0, step: 6 }, rng));
  L.push(mk([[101, hy + 11], [103, hy + 13]], { w: 11, col: INK, a: .85, prof: 'even', nb: 0, step: 2 }, rng));
  L.push(mk([[62, hy - 14], [52, hy + 10], [56, hy + 36 + Math.max(0, droop) * .2]], { w: 22, col: dogCols.ear, a: .7, prof: 'leaf', nb: 2, step: 7 }, rng));
  L.push(mk([[79, hy - 4], [80, hy - 3]], { w: 7, col: INK, a: .9, prof: 'even', nb: 0, step: 2 }, rng));
  // collar + tag (the accent)
  const sw = Math.sin(t * 5) * 2.5 * (moving ? 1 : .3);
  L.push(mk([[52, -80 + droop * .4 + bob], [58, -66 + bob]], { w: 6, col: hex('#5c3b2b'), a: .75, prof: 'even', nb: 0, step: 6 }, rng));
  L.push(mk([[58 + sw, -62 + bob], [58 + sw, -61 + bob]], { w: 12, col: dogCols.tag, a: .95, prof: 'even', nb: 0, step: 2 }, rng));
  return L;
}
function dogSpeed(t) { return (dogX(t + .02) - dogX(t - .02)) / .04; }
function drawDog(t, ax, ay, z) {
  const dp = seg(t, .3, 5.2), L = dogStrokes(t);
  ctx.save(); ctx.translate(ax, ay); ctx.scale(z * 1.35, z * 1.35);
  // shadow wash
  ctx.fillStyle = rgba(mixc(hex('#7d8aa0'), hex('#b9936a'), mood(t)), .16 * (t < 36 ? 1 : .8)); ctx.beginPath(); ctx.ellipse(8, 3, 92, 11, 0, 0, TAU); ctx.fill();
  drawList(L, dp < 1 ? dp : 2);
  ctx.restore();
}

/* ------------------------------------------------------------------ washes (sky / ground / mist) */
function wavyEdge(x0, x1, yfn, step = 32) { const pts = []; for (let x = x0; x <= x1 + step; x += step) pts.push([x, yfn(x)]); return pts; }
function washPoly(edge, closeTo, col, a, seedv, passes = 3) {
  for (let k = 0; k < passes; k++) {
    ctx.fillStyle = rgba(col, a / passes * 1.5); ctx.beginPath();
    edge.forEach(([x, y], i) => { const j = (hash(seedv + k * 7.3 + i * .37) - .5) * 7; ctx.lineTo(x + j * .4, y + j); });
    closeTo(); ctx.closePath(); ctx.fill();
  }
}
function drawWashes(t, ax, ay, z, dx) {
  const gate = ss(seg(t, 5.5, 9)), cold = gate * (1 - ss(seg(t, 33.2, 35.4)));
  const sc = keyCol(SKY, t), gc = keyCol(GRD, t);
  const hzs = [ay + 14, ay - 130 * z, ay - 270 * z];
  if (cold > .01) {
    for (let k = 0; k < 3; k++) {
      const hk = hzs[k]; const e = wavyEdge(-60, W + 60, x => hk + 38 * (vnoise((x / z + dx * .7) / 300 + k * 4) - .5) * 2 + 18 * (vnoise((x / z + dx * .7) / 90 + k) - .5));
      washPoly(e, () => { ctx.lineTo(W + 60, -80); ctx.lineTo(-60, -80); }, sc, .3 * cold, 3 + k);
    }
    // ground
    const e = wavyEdge(-60, W + 60, x => ay - 4 + 6 * (vnoise((x / z + dx) / 160) - .5));
    washPoly(e, () => { ctx.lineTo(W + 60, H + 40); ctx.lineTo(-60, H + 40); }, gc, .3 * cold, 11);
    const e2 = wavyEdge(-60, W + 60, x => ay + 130 * z + 24 * (vnoise((x / z + dx) / 240) - .5) * 2);
    washPoly(e2, () => { ctx.lineTo(W + 60, H + 40); ctx.lineTo(-60, H + 40); }, dark(gc, .8), .22 * cold, 17);
  }
  // warm bloom from the right
  const cover = lerp(W + 260, -260, ss(seg(t, 37, 43.5)));
  if (cover < W + 200) {
    const wsky = keyCol([[41, hex('#f6d49a')], [52, hex('#f2bd78')], [58, hex('#f0ad66')]], t), wg = keyCol([[41, hex('#d6b274')], [52, hex('#c49a5a')], [58, hex('#b4864a')]], t);
    for (let k = 0; k < 3; k++) {
      const hk = hzs[k];
      const e = wavyEdge(cover - 40, W + 80, x => hk + 34 * (vnoise((x / z + dx * .7) / 280 + k * 9) - .5) * 2);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      washPoly(e, () => { ctx.lineTo(W + 80, -80); ctx.lineTo(cover - 40 + 30 * Math.sin(k), -80); }, wsky, .34, 23 + k);
      ctx.restore();
    }
    const e = wavyEdge(cover - 40, W + 80, x => ay - 4 + 6 * (vnoise((x / z + dx) / 150) - .5));
    washPoly(e, () => { ctx.lineTo(W + 80, H + 40); ctx.lineTo(cover - 40, H + 40); }, wg, .34, 31);
    const e2 = wavyEdge(cover - 40, W + 80, x => ay + 140 * z + 24 * (vnoise((x / z + dx) / 250) - .5) * 2);
    washPoly(e2, () => { ctx.lineTo(W + 80, H + 40); ctx.lineTo(cover - 40, H + 40); }, dark(wg, .82), .22, 37);
  }
}
function drawMist(t) {
  const u = seg(t, 32.2, 35.6), fade = 1 - ss(seg(t, 37.8, 40.6)); if (u <= 0 || fade <= 0) return;
  for (let b = 0; b < 4; b++) {
    const uu = clamp(u * 1.25 - b * .08), edge = H + 160 - (H + 520) * eio(uu);
    ctx.fillStyle = rgba(PAPER, (b === 3 ? .97 : .5) * fade);
    ctx.beginPath(); ctx.moveTo(-40, H + 60);
    for (let x = -40; x <= W + 40; x += 40) ctx.lineTo(x, edge + 36 * Math.sin(x * .004 + b * 1.7 + t * .3) + 22 * (vnoise(x / 90 + b) - .5) - b * 34);
    ctx.lineTo(W + 40, H + 60); ctx.closePath(); ctx.fill();
  }
}

/* ------------------------------------------------------------------ rain */
function drawRain(t, z) {
  const k = ss(seg(t, 7.5, 10)) * (1 - ss(seg(t, 30.5, 33)));
  if (k <= 0.01) return;
  const fr = Math.floor(t * 12), n = Math.floor(160 * k), rng = mulberry(fr * 977 + 5);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rng() * (W + 200) - 100, y = rng() * (H + 100) - 50, l = 26 + rng() * 34;
    ctx.strokeStyle = `rgba(86,104,134,${.2 + rng() * .22})`; ctx.lineWidth = 1.3 + rng() * 1.1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l * .26, y + l); ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ text */
const inkTxt = (a = .8) => `rgba(60,48,56,${a})`;
function halo(txt, x, y, lw = 9) { ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(243,234,214,.96)'; ctx.lineWidth = lw; ctx.strokeText(txt, x, y); }
function writeText(txt, x, y, font, prog, align = 'left', col = inkTxt(.85), lw = 9) {
  ctx.save(); ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(txt).width, x0 = align === 'center' ? x - w / 2 : x;
  ctx.beginPath(); ctx.rect(x0 - 12, y - 120, (w + 24) * prog, 180); ctx.clip();
  halo(txt, x, y, lw); ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.fillText(txt, x + .6, y + .5);
  ctx.restore();
}
const NOTES = [
  { id: 'n1', x: 380, y: -430, text: 'Tuesday. Rain.', size: 54, leader: [-30, 140] },
  { id: 'n2', x: 1000, y: -330, text: 'market, 6 o’clock', size: 48, leader: [10, 130] },
  { id: 'n3', x: 2250, y: -250, text: 'the river does not answer', size: 48, leader: [60, 150] },
  { id: 'n4', x: 3690, y: -560, text: 'bread?', size: 66, leader: [0, 120] },
];
const MONO = [{ id: 'm1', x: 3560, y: 78, text: 'home: 412 m', t0: 41, t1: 49 }, { id: 'm2', x: 4600, y: 78, text: 'home: 88 m', t0: 51, t1: 53.5 }];
function noteState(n, t, ax, ay, z, dx) {
  const sx = ax + (n.x - dx) * z; const p = clamp((1480 - sx) / 260); const gate = (n.id === 'n4') ? ss(seg(t, 41, 42.5)) : ss(seg(t, 10, 11.4));
  const vis = (n.id === 'n1' || n.id === 'n2' || n.id === 'n3') ? 1 - ss(seg(t, 33, 35)) : 1;
  return { sx, sy: ay + n.y * z, p: Math.min(p, gate), vis };
}
function drawNotes(t, ax, ay, z, dx) {
  for (const n of NOTES) {
    const s = noteState(n, t, ax, ay, z, dx); if (s.p <= 0 || s.vis <= 0 || s.sx < -600 || s.sx > W + 100) continue;
    ctx.save(); ctx.globalAlpha = s.vis;
    ctx.strokeStyle = inkTxt(.55); ctx.lineWidth = 2; ctx.beginPath();
    const L = n.leader; ctx.moveTo(s.sx + 10, s.sy + 18); ctx.quadraticCurveTo(s.sx + 10 + L[0] * z * .3, s.sy + 18 + L[1] * z * .5, s.sx + 10 + L[0] * z, s.sy + 18 + L[1] * z * .85 * s.p); ctx.stroke();
    writeText(n.text, s.sx, s.sy, `${n.size}px Caveat`, eo(s.p)); ctx.restore();
  }
  for (const m of MONO) {
    if (t < m.t0 || t > m.t1 + 1) continue;
    const sx = ax + (m.x - dx) * z, sy = ay + m.y * z, p = ss(seg(t, m.t0, m.t0 + 1.2));
    if (sx < -400 || sx > W + 100) continue;
    ctx.save(); ctx.globalAlpha = .9 * (1 - ss(seg(t, m.t1, m.t1 + 1))); writeText(m.text, sx, sy, `${Math.round(34 * Math.min(z, 1.5))}px Plex`, p, 'left', inkTxt(.7), 7); ctx.restore();
  }
}
function drawTitle(t) {
  const p = ss(seg(t, 3.2, 4.8)), out = ss(seg(t, 8.8, 10)); if (p <= 0 || out >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - out;
  writeText('The Long Way Home', W / 2, 220, '600 110px Cormorant', p, 'center', inkTxt(.85), 12);
  ctx.restore();
}
function subtitle(t) {
  for (const v of VOICE) {
    const t1 = v.t + hold(v); if (t < v.t - .1 || t > t1 + .3) continue;
    const a = ss(seg(t, v.t - .1, v.t + .25)) * (1 - ss(seg(t, t1 - .2, t1 + .3)));
    ctx.save(); ctx.globalAlpha = a; ctx.font = 'italic 500 44px Cormorant'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // balance into <=2 lines
    const words = v.text.split(' '); let l1 = v.text, l2 = '';
    if (ctx.measureText(v.text).width > 1250) { let best = 1e9; for (let i = 3; i < words.length - 2; i++) { const a1 = words.slice(0, i).join(' '), a2 = words.slice(i).join(' '), d = Math.abs(ctx.measureText(a1).width - ctx.measureText(a2).width); if (d < best) { best = d; l1 = a1; l2 = a2; } } }
    const lines = l2 ? [l1, l2] : [l1], y0 = 1000 - (lines.length - 1) * 52;
    lines.forEach((ln, i) => { halo(ln, W / 2, y0 + i * 52, 20); ctx.fillStyle = inkTxt(.82); ctx.fillText(ln, W / 2, y0 + i * 52); });
    ctx.restore();
  }
}
window.SUBS = () => VOICE.map(v => ({ t0: v.t, t1: v.t + hold(v), text: v.text }));

/* ------------------------------------------------------------------ frame */
function screenOf(o, ax, z, dx) { return ax + (o.x - dx) * o.L.f * z; }
function objProgress(o, t, sx) {
  const gate = o.warm ? ss(seg(t, 40.4, 43.5)) : ss(seg(t, 5.8, 9.5));
  let p = clamp((1780 - sx) / 520) * gate;
  if (o.tag === 'house') p = Math.min(p, 1) * (t > 55 ? 1 : 1);
  return p;
}
function drawPaper(ax, ay, z, dx) {
  ctx.fillStyle = '#f3ead6'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(ax, ay); ctx.scale(z, z);
  const PW = 2304, off = -(((dx) % PW) + PW) % PW;
  for (let k = -1; k <= 2; k++) ctx.drawImage(paper, off + k * PW - 640, -900);
  ctx.restore();
}
function render(t) {
  const z = zoomAt(t), ax = axAt(t), ay = gyAt(t), dx = dogX(t);
  drawPaper(ax, ay, z, dx * .9);
  drawWashes(t, ax, ay, z, dx);
  const order = ['far', 'mid', 'main'];
  for (const layer of order) {
    for (const o of objs) {
      if (o.layer !== layer) continue;
      if (!o.warm && t > 35.5) continue;
      if (o.warm && t < 40.4) continue;
      const sx = screenOf(o, ax, z, dx), sc = o.L.sc * z;
      if (sx < -o.w * sc - 200 || sx > W + 200) continue;
      let p = objProgress(o, t, sx); if (p <= 0) continue;
      if (o.tag === 'river' || o.tag === 'bridge') { p = Math.min(1, p * 1.2); }
      ctx.save(); ctx.translate(sx, ay + o.L.y * z); ctx.scale(sc, sc);
      ctx.globalAlpha = layer === 'far' ? .75 : layer === 'mid' ? .9 : 1;
      drawList(o.list, p); ctx.restore();
    }
    if (layer === 'main') {
      if (t > 52) drawDoorLight(t, ax, ay, z, dx);
    }
  }
  drawMist(t);
  drawNotes(t, ax, ay, z, dx);
  drawDog(t, ax, ay, z);
  for (const o of objs) {
    if (o.layer !== 'fg') continue;
    if (!o.warm || t < 40.4) continue;
    const sx = screenOf(o, ax, z, dx), sc = o.L.sc * z; if (sx < -300 || sx > W + 300) continue;
    ctx.save(); ctx.translate(sx, ay + o.L.y * z); ctx.scale(sc, sc); drawList(o.list, objProgress(o, t, sx)); ctx.restore();
  }
  drawRain(t, z);
  drawTitle(t);
  subtitle(t);
  // vignette
  const g = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * .95); g.addColorStop(0, 'rgba(120,90,50,0)'); g.addColorStop(1, 'rgba(120,90,50,.14)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawDoorLight(t, ax, ay, z, dx) {
  // the door opens a crack; warm light spills out
  const house = objs.find(o => o.tag === 'house'); const sx = screenOf(house, ax, z, dx);
  const k = ss(seg(t, 55.2, 58.4)); if (k <= 0) return;
  const dxs = sx, w = 4 + 60 * k;
  ctx.save(); ctx.translate(dxs, ay); ctx.scale(z, z);
  ctx.fillStyle = rgba(hex('#f7d781'), .7 * k); ctx.fillRect(-2, -130, w, 128);
  ctx.fillStyle = rgba(hex('#f7d781'), .22 * k); ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(w + 100 * k, 10); ctx.lineTo(w + 20, -4); ctx.closePath(); ctx.fill();
  ctx.restore();
}
window.render = render;

/* ------------------------------------------------------------------ cues for the mixer */
function buildEV() {
  const ev = [];
  // steps
  let last = Math.floor(dogX(0) / 38);
  for (let t = 0; t <= DUR; t += 1 / 48) {
    const k = Math.floor(dogX(t) / 38);
    if (k !== last && t > 7) { const x = dogX(t); ev.push({ t: +t.toFixed(3), type: 'step', surf: x < 1950 ? 'stone' : x < 2850 ? 'boards' : x < 3405 ? 'wet' : 'soil', gain: t < 36 ? .8 : t < 41 ? .5 : 1 }); }
    last = k;
  }
  // brush rustle: when an object starts / half-way painting, quantised
  const z = 1, ax = 640;
  const seen = {};
  for (let t = 5; t <= 58; t += 1 / 24) {
    const dx = dogX(t), zz = zoomAt(t), aa = axAt(t);
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]; if (o.layer === 'fg') continue; if (!o.warm && t > 35.5) continue;
      const p = objProgress(o, t, screenOf(o, aa, zz, dx));
      if (p > .03 && !seen[i]) { seen[i] = 1; ev.push({ t: +t.toFixed(3), type: 'brush', gain: o.layer === 'far' ? .35 : o.layer === 'mid' ? .5 : .7, pan: clamp(((screenOf(o, aa, zz, dx)) - 960) / 960, -1, 1) }); }
    }
  }
  for (let t = .4; t < 4.8; t += .55) ev.push({ t: +t.toFixed(2), type: 'brush', gain: .7, pan: 0 });
  for (const n of NOTES) { for (let t = 5; t < 58; t += 1 / 24) { const dx = dogX(t); const s = noteState(n, t, axAt(t), gyAt(t), zoomAt(t), dx); if (s.p > .02) { ev.push({ t: +t.toFixed(2), type: 'pencil' }); break; } } }
  ev.push({ t: 3.3, type: 'pencil' }, { t: 41.2, type: 'pencil' }, { t: 52.9, type: 'pencil' });
  VOICE.forEach(v => ev.push({ t: v.t, type: 'voice', id: v.id }));
  ev.push({ t: 32.2, type: 'mist' }, { t: 55.3, type: 'latch' }, { t: 56.3, type: 'tag' });
  ev.sort((a, b) => a.t - b.t); return ev;
}
window.TEXTS = t => {
  const out = []; const z = zoomAt(t), ax = axAt(t), ay = gyAt(t), dx = dogX(t);
  for (const v of VOICE) { const t1 = v.t + hold(v); if (t >= v.t && t <= t1) out.push({ id: v.id, text: v.text, x0: 300, y0: 940, x1: 1620, y1: 1020 }); }
  for (const n of NOTES) { const s = noteState(n, t, ax, ay, z, dx); if (s.p >= .99 && s.vis > .9 && s.sx > 0 && s.sx < W - 300) out.push({ id: n.id, text: n.text, x0: s.sx, y0: s.sy - 40, x1: s.sx + 500, y1: s.sy + 10 }); }
  if (t > 4.8 && t < 8.8) out.push({ id: 'title', text: 'The Long Way Home', x0: 560, y0: 120, x1: 1360, y1: 240 });
  return out;
};

/* ------------------------------------------------------------------ init */
async function init() {
  await Promise.all(['italic 500 40px Cormorant', '600 40px Cormorant', '40px Caveat', '20px Plex'].map(f => document.fonts.load(f)));
  paper = makePaper(); buildWorld();
  window.EV = buildEV();
  window.READY = true;
}
init();
