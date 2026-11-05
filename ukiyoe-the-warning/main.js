import { clamp, lerp, seg, ss, eio, eo, ei, mulberry, vnoise, hash, TAU } from '/core/lib.js';

const W = 1920, H = 1080, DUR = 60;
window.DUR = DUR;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const SW = 1560, SH = 900, GAP = 200, PITCH = SW + GAP, NP = 3;
const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const COL = { key: '#1b1814', pale: '#a9c3d4', blue: '#20466f', ochre: '#e2b862', green: '#7d9962', grey: '#b3ada1', red: '#c13a2b' };
const ORDER = ['key', 'pale', 'ochre', 'green', 'blue', 'grey', 'red'];
const REG = { key: [0, 0], pale: [-2, 1], blue: [2, -1.5], ochre: [-1.5, -2], green: [2.2, 1.2], grey: [1, 2], red: [-2.2, -1] };
const WASHI = '#efe3c8';
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* ------------------------------------------------------------------ voice, subtitles */
const VOICE = [
  { id: 'v1', t: 3.0, d: 4.095, text: 'The old woman said: do not go when the sky turns brown.' },
  { id: 'v2', t: 13.0, d: 4.106, text: 'He went. The sea was kind, as it always is at first.' },
  { id: 'v3', t: 23.0, d: 3.051, text: 'By noon, the horizon had learned his name.' },
  { id: 'v4', t: 32.6, d: 5.478, text: 'He had been warned of its fury. No one had warned him it would be beautiful.' },
  { id: 'v5', t: 48.8, d: 4.206, text: 'At dusk, one lamp on the shore. She did not say a word.' },
];
window.VOICE = VOICE;
const subEnd = v => v.end ?? v.t + Math.max(1.8, v.d + .6);
const PANS = [[15.0, 22.0], [28.5, 34.5]];            // the camera crosses the triptych in two slow pans
const ART = [9.2, 22.3, 34.8];
const LEAVE = [14.6, 28.2, 40.8];
const FOCUS0 = [840, 470];                            // the opening crop: the tip of the old woman's pointing stick

/* ------------------------------------------------------------------ drawing helpers */
function smooth(pts, step = 9) {
  const n = pts.length, out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < m; k++) { const t = k / m, t2 = t * t, t3 = t2 * t; out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  out.push(pts[n - 1]); return out;
}
function ribbon(g, pts, w0, w1, col, seed = 0, jit = .22, step = 9, cap = true) {
  const S = smooth(pts, step), n = S.length, Lp = [], Rp = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const u = i / (n - 1), tp = cap ? Math.min(1, u * 7 + .12) * Math.min(1, (1 - u) * 7 + .12) : 1, w = lerp(w0, w1, u) * tp * (1 + jit * (vnoise(seed + u * 5) - .5) * 2);
    Lp.push([S[i][0] - ty * w / 2, S[i][1] + tx * w / 2]); Rp.push([S[i][0] + ty * w / 2, S[i][1] - tx * w / 2]);
  }
  g.fillStyle = col; g.beginPath(); Lp.forEach(p => g.lineTo(p[0], p[1])); for (let i = n - 1; i >= 0; i--) g.lineTo(Rp[i][0], Rp[i][1]); g.closePath(); g.fill();
}
function poly(g, pts, col, smoothIt = false, close = true) { const P = smoothIt ? smooth(close ? [...pts, pts[0], pts[1]] : pts, 8) : pts; g.fillStyle = col; g.beginPath(); P.forEach(p => g.lineTo(p[0], p[1])); g.closePath(); g.fill(); }
function bokashi(g, x, y, w, h, col, dir, str, seed, pow = 1.15) {
  const c = mkc(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data, [r, gg, b] = rgb(col);
  for (let xx = 0; xx < w; xx++) { const wob = (vnoise(seed + xx / 110) - .5) * .2 + (vnoise(seed * 3 + xx / 27) - .5) * .07; for (let yy = 0; yy < h; yy++) { const t = (dir === 'down' ? yy / h : 1 - yy / h) + wob, a = Math.pow(clamp(1 - t), pow) * str * (.93 + .07 * hash(xx * .37 + yy * 1.7 + seed)); const i = (yy * w + xx) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a * 255; } }
  cx.putImageData(img, 0, 0); g.drawImage(c, x, y);
}
function seaBase(B, y0, y1) { B.pale.fillStyle = COL.pale; B.pale.fillRect(36, y0, SW - 72, y1 - y0); }
function seaBand(g, y0, y1, col, period, amp, seed, phase = 0) { g.fillStyle = col; g.beginPath(); g.moveTo(36, y1); for (let x = 36; x <= SW - 36; x += 8) g.lineTo(x, y0 - amp * Math.abs(Math.sin((x + phase) / period * Math.PI)) + (vnoise(seed + x / 130) - .5) * 6); g.lineTo(SW - 36, y1); g.closePath(); g.fill(); }
function pad(B, x, y, w, h, seed) {
  const r = mulberry(seed); B.green.fillStyle = COL.green; B.green.beginPath(); B.green.moveTo(x - w / 2, y);
  for (let i = 0; i <= 12; i++) { const u = i / 12; B.green.lineTo(x - w / 2 + u * w, y - h * (.55 + .45 * Math.sin(u * Math.PI)) + (r() - .5) * 6); }
  for (let i = 12; i >= 0; i--) { const u = i / 12; B.green.lineTo(x - w / 2 + u * w, y + h * .35 * (1 + Math.sin(u * 12) * .35)); } B.green.closePath(); B.green.fill();
  for (let i = 0; i < 26; i++) { const nx = x - w / 2 + r() * w, ny = y + h * .12 + r() * h * .22; for (let k = -2; k <= 2; k++) { B.key.strokeStyle = COL.key; B.key.lineWidth = 1.6; B.key.beginPath(); B.key.moveTo(nx, ny); B.key.lineTo(nx + k * 7, ny + 13 + Math.abs(k) * -2); B.key.stroke(); } }
  ribbon(B.key, [[x - w / 2, y - h * .1], [x, y - h * .62], [x + w / 2, y - h * .1]], 3.6, 3.2, COL.key, seed, .35);
}
function line(g, pts, w, col = COL.key) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); smooth(pts, 7).forEach(p => g.lineTo(p[0], p[1])); g.stroke(); }
function border(B) { B.key.strokeStyle = COL.key; B.key.lineWidth = 9; B.key.strokeRect(34, 34, SW - 68, SH - 68); B.key.lineWidth = 2.6; B.key.strokeRect(48, 48, SW - 96, SH - 96); }
function seal(B, x, y, s, rot = 0) { const g = B.red; g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = COL.red; g.fillRect(-s / 2, -s / 2, s, s); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.moveTo(-s * .28, s * .12); g.lineTo(s * .28, s * .12); g.lineTo(s * .18, s * .28); g.lineTo(-s * .2, s * .28); g.closePath(); g.fill(); g.beginPath(); g.moveTo(0, -s * .3); g.lineTo(s * .22, s * .06); g.lineTo(-s * .02, s * .06); g.closePath(); g.fill(); g.fillRect(-s * .35, s * .32 - 3, s * .7, 3); const r = mulberry(9); for (let i = 0; i < 40; i++) g.fillRect(-s / 2 + r() * s, -s / 2 + r() * s, 3 + r() * 5, 2 + r() * 3); g.restore(); }
function figure(B, x, y, s, kind) { // flat standing figure: kimono polygon, hat, face strokes
  const k = B.key, rb = kind === 'fisher' ? B.blue : B.grey;
  poly(rb, [[x - 24 * s, y - 118 * s], [x + 24 * s, y - 118 * s], [x + 34 * s, y], [x - 34 * s, y]], kind === 'fisher' ? COL.blue : COL.grey);
  ribbon(k, [[x - 24 * s, y - 118 * s], [x - 34 * s, y]], 3.4, 3.4, COL.key, x); ribbon(k, [[x + 24 * s, y - 118 * s], [x + 34 * s, y]], 3.4, 3.4, COL.key, x + 4);
  ribbon(k, [[x - 34 * s, y], [x + 34 * s, y]], 3, 3, COL.key, x + 8);
  B.ochre.fillStyle = kind === 'fisher' ? COL.ochre : COL.pale; B.ochre.beginPath(); B.ochre.ellipse(x, y - 134 * s, 28 * s, 11 * s, 0, 0, TAU); B.ochre.fill();
  if (kind === 'fisher') { line(k, [[x - 28 * s, y - 134 * s], [x, y - 148 * s], [x + 28 * s, y - 134 * s]], 3.4); }
  else { poly(B.grey, [[x - 14 * s, y - 138 * s], [x + 18 * s, y - 138 * s], [x + 16 * s, y - 112 * s], [x - 14 * s, y - 112 * s]], COL.grey); }
  line(k, [[x - 10 * s, y - 126 * s], [x + 10 * s, y - 126 * s]], 2.4); line(k, [[x - 11 * s, y - 100 * s], [x + 11 * s, y - 100 * s]], 2.4);
  k.fillStyle = COL.key; k.fillRect(x - 6 * s, y - 118 * s, 3, 3); k.fillRect(x + 4 * s, y - 118 * s, 3, 3);
}
function newBlocks() { const o = {}, c = {}; for (const n of ORDER) { c[n] = mkc(SW, SH); o[n] = c[n].getContext('2d'); } return { ...o, _c: c }; }

/* ------------------------------------------------------------------ textures */
let PAP, GRAIN, SPECK, MOUNT;
function makeTextures() {
  const r = mulberry(3);
  PAP = mkc(SW, SH); let g = PAP.getContext('2d'); g.fillStyle = WASHI; g.fillRect(0, 0, SW, SH);
  for (const [cell, a] of [[220, .05], [60, .04], [14, .03]]) { const c = mkc(Math.ceil(SW / cell) + 2, Math.ceil(SH / cell) + 2), cg = c.getContext('2d'), im = cg.createImageData(c.width, c.height); for (let i = 0; i < c.width * c.height; i++) { const v = r() > .5 ? 255 : 0; im.data[i * 4] = v; im.data[i * 4 + 1] = v * .9; im.data[i * 4 + 2] = v * .7; im.data[i * 4 + 3] = a * 255 * r(); } cg.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, SW + cell * 2, SH + cell * 2); }
  for (let i = 0; i < 2400; i++) { g.strokeStyle = r() < .55 ? 'rgba(120,95,55,.10)' : 'rgba(255,252,240,.30)'; g.lineWidth = .8 + r() * .6; const x = r() * SW, y = r() * SH, a = r() * TAU, l = 10 + r() * 38; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l / 2 + (r() - .5) * 8, y + Math.sin(a) * l / 2 + (r() - .5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const vg = g.createRadialGradient(SW / 2, SH / 2, SH * .45, SW / 2, SH / 2, SW * .62); vg.addColorStop(0, 'rgba(140,100,50,0)'); vg.addColorStop(1, 'rgba(140,100,50,.16)'); g.fillStyle = vg; g.fillRect(0, 0, SW, SH);
  // block texture masks (drawn with destination-out): woodgrain + baren + goma specks
  GRAIN = mkc(SW, SH); g = GRAIN.getContext('2d');
  for (let i = 0; i < 260; i++) { const y0 = r() * SH, amp = 3 + r() * 10, ph = r() * 9, fr = 90 + r() * 200; g.strokeStyle = `rgba(0,0,0,${.1 + r() * .14})`; g.lineWidth = .8 + r() * 1.6; g.beginPath(); for (let x = 0; x <= SW; x += 24) g.lineTo(x, y0 + Math.sin(x / fr + ph) * amp + vnoise(i + x / 300) * 22); g.stroke(); }
  for (let i = 0; i < 70; i++) { const cx = r() * SW, cy = r() * SH, rad = 40 + r() * 190, a0 = r() * TAU; g.strokeStyle = `rgba(0,0,0,${.03 + r() * .05})`; g.lineWidth = 5 + r() * 16; g.beginPath(); g.arc(cx, cy, rad, a0, a0 + 1.2 + r() * 1.6); g.stroke(); }
  g.drawImage(speckCanvas(r, 2600), 0, 0);
  SPECK = speckCanvas(mulberry(5), 2400);
  MOUNT = mkc(512, 512); g = MOUNT.getContext('2d'); g.fillStyle = '#c3aa7c'; g.fillRect(0, 0, 512, 512); const im = g.getImageData(0, 0, 512, 512); for (let i = 0; i < 512 * 512; i++) { const v = (r() - .5) * 16 + (vnoise((i % 512) / 40 + (i / 512 | 0) / 90) - .5) * 20; im.data[i * 4] += v; im.data[i * 4 + 1] += v; im.data[i * 4 + 2] += v * .8; } g.putImageData(im, 0, 0);
  for (let i = 0; i < 500; i++) { g.strokeStyle = r() < .5 ? 'rgba(90,70,40,.12)' : 'rgba(240,225,190,.22)'; g.lineWidth = .8; const x = r() * 512, y = r() * 512, a = r() * TAU, l = 8 + r() * 30; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}
function speckCanvas(r, n) { const c = mkc(SW, SH), g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.55)'; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(r() * SW, r() * SH, .6 + r() * 1.4, 0, TAU); g.fill(); } return c; }
function texture(B) { for (const n of ORDER) { const g = B[n]; g.save(); g.globalCompositeOperation = 'destination-out'; g.drawImage(n === 'key' ? SPECK : GRAIN, 0, 0); g.restore(); } }

/* ------------------------------------------------------------------ the five prints */
const BL = [], FIN = [], CART = [];
const TITLES = ['Morning', 'Noon', 'The Storm'];
function cartouche(i) {
  const c = mkc(150, 560), g = c.getContext('2d'); g.fillStyle = '#f2e7cb'; g.fillRect(0, 0, 150, 560);
  g.strokeStyle = COL.key; g.lineWidth = 6; g.strokeRect(5, 5, 140, 550); g.lineWidth = 2; g.strokeRect(14, 14, 122, 532);
  g.fillStyle = '#b7cfdb'; g.fillRect(14, 14, 122, 112); g.save(); g.translate(75, 70); g.rotate(Math.PI / 2); g.fillStyle = COL.key; g.font = '500 17px Shippori'; g.textAlign = 'center'; g.fillText('THREE SHEETS', 0, 6); g.restore();
  g.save(); g.translate(75, 292); g.rotate(Math.PI / 2); g.fillStyle = COL.key; g.font = '400 33px Yuji'; g.textAlign = 'center'; g.fillText(`No. ${i + 1}  ${TITLES[i]}`, 0, 11); g.restore();
  g.fillStyle = COL.red; g.fillRect(52, 478, 46, 46); g.fillStyle = '#f2e7cb'; g.fillRect(62, 488, 26, 5); g.fillRect(70, 493, 10, 26);
  return c;
}
function print1() {
  const B = newBlocks(), r = mulberry(11); border(B);
  const hz = 430;
  bokashi(B.pale, 36, 36, SW - 72, 380, COL.pale, 'down', .8, 1); bokashi(B.ochre, 36, 250, SW - 72, 180, COL.ochre, 'up', .55, 2);
  for (let j = 0; j < 2; j++) { const y = 352 + j * 30, x0 = 1040 + j * 30, x1 = 1280 - j * 20; B.grey.fillStyle = COL.grey; B.grey.beginPath(); B.grey.moveTo(x0, y + 30); for (let x = x0; x <= x1; x += 26) B.grey.arc(x + 13, y + 18, 20 + vnoise(x / 60 + j) * 10, Math.PI, 0); B.grey.lineTo(x1, y + 32); B.grey.closePath(); B.grey.fill(); line(B.key, [[x0, y + 30], [x1, y + 32]], 3); } // the small warning cloud on the horizon
  // sun half-risen (beni), far sea line
  B.red.fillStyle = COL.red; B.red.beginPath(); B.red.arc(330, hz, 54, Math.PI, 0); B.red.fill(); line(B.key, [[36, hz], [SW - 36, hz]], 3);
  // sea
  seaBase(B, hz, 640); for (let j = 0; j < 4; j++) seaBand(B.blue, hz + 30 + j * 46, hz + 30 + j * 46 + 26, COL.blue, 90 + j * 20, 7 + j * 2, 7 + j, j * 40);
  for (let i = 0; i < 18; i++) line(B.key, [[100 + r() * 1300, hz + 40 + r() * 140], [150 + r() * 1300, hz + 42 + r() * 140]].sort((a, b) => a[0] - b[0]), 1.8);
  // beach (ochre) with a carved edge
  poly(B.ochre, [[36, 640], [500, 590], [1100, 600], [SW - 36, 540], [SW - 36, SH - 36], [36, SH - 36]], COL.ochre, true); ribbon(B.key, [[36, 640], [500, 590], [1100, 600], [SW - 36, 540]], 4.2, 3.4, COL.key, 12);
  for (let i = 0; i < 90; i++) { const x = 60 + r() * (SW - 120), y = 640 + r() * 200; line(B.key, [[x, y], [x + 8, y + 1]], 1.6); }
  // pine, flat pads, trunk
  ribbon(B.key, [[130, SH - 36], [150, 640], [210, 470], [190, 300], [230, 190]], 40, 14, COL.key, 13, .3); ribbon(B.ochre, [[134, SH - 36], [154, 640], [214, 470], [194, 300]], 26, 10, COL.ochre, 14, .3);
  pad(B, 330, 290, 300, 90, 15); pad(B, 150, 360, 280, 80, 16); pad(B, 300, 470, 240, 70, 17); pad(B, 230, 200, 260, 70, 18);
  // boat on the beach
  poly(B.ochre, [[1130, 660], [1420, 660], [1380, 706], [1170, 706]], '#c58b33'); ribbon(B.key, [[1130, 660], [1170, 706], [1380, 706], [1420, 660], [1130, 660]], 4, 4, COL.key, 21); line(B.key, [[1160, 684], [1390, 684]], 2);
  // the old woman and the fisherman
  figure(B, 760, 700, 1.15, 'fisher'); figure(B, 560, 710, .95, 'old');
  line(B.key, [[598, 610], [690, 560], [840, 470]], 4); // her stick, pointing at the cloud
  B.ochre.fillStyle = COL.ochre; line(B.key, [[800, 600], [830, 690], [850, 720]], 3); // net rope
  seal(B, 110, SH - 100, 54, -.06);
  return B;
}
function print2() {
  const B = newBlocks(), r = mulberry(22); border(B); const hz = 470;
  bokashi(B.pale, 36, 36, SW - 72, 420, COL.pale, 'down', .4, 21); bokashi(B.grey, 36, 36, SW - 72, 430, COL.grey, 'down', .75, 25, .7); bokashi(B.ochre, 36, 300, SW - 72, 170, COL.ochre, 'up', .8, 22, .8);
  for (let j = 0; j < 5; j++) { const y = 120 + j * 52, x0 = 1060 + (j % 2) * 40 - j * 16, x1 = 1500 - (j % 3) * 30; B.pale.fillStyle = COL.pale; B.pale.beginPath(); B.pale.moveTo(x0, y + 40); for (let x = x0; x <= x1; x += 30) B.pale.arc(x + 15, y + 26, 28 + (vnoise(x / 70 + j) * 14), Math.PI, 0); B.pale.lineTo(x1, y + 42); B.pale.closePath(); B.pale.fill(); line(B.key, [[x0, y + 40], [x1, y + 42]], 3); }
  // the mountain: lit side pale, shade blue, snow = paper
  poly(B.pale, [[360, hz], [640, 150], [880, hz]], COL.pale, true); poly(B.blue, [[640, 150], [700, 250], [800, 360], [880, hz], [760, hz], [680, 300]], COL.blue, true);
  B.pale.save(); B.pale.globalCompositeOperation = 'destination-out'; B.pale.fillStyle = '#000'; B.pale.beginPath(); B.pale.moveTo(560, 220); for (let i = 0; i <= 8; i++) B.pale.lineTo(570 + i * 13, 215 + (i % 2 ? 40 : 14) + i * 2); B.pale.lineTo(700, 150); B.pale.closePath(); B.pale.fill(); B.pale.restore();
  ribbon(B.key, [[360, hz], [500, 320], [640, 150]], 3.6, 2.6, COL.key, 23); ribbon(B.key, [[640, 150], [760, 330], [880, hz]], 2.6, 3.6, COL.key, 24);
  // sun and far line
  B.red.fillStyle = COL.red; B.red.beginPath(); B.red.arc(1010, 250, 66, 0, TAU); B.red.fill(); line(B.key, [[36, hz], [SW - 36, hz]], 3);
  seaBase(B, hz, SH - 36); for (let j = 0; j < 7; j++) seaBand(B.blue, hz + 24 + j * 58, hz + 24 + j * 58 + 30 + j * 3, COL.blue, 70 + j * 24, 6 + j * 2.4, 30 + j, j * 37);
  for (let i = 0; i < 40; i++) { const x = 80 + r() * 1400, y = hz + 40 + r() * 340; line(B.key, [[x, y], [x + 50 + r() * 60, y + 2]], 1.8); }
  // foreground wave curls (foam = paper)
  for (const [x, y] of [[200, 800], [900, 820], [1380, 790]]) { B.blue.save(); B.blue.globalCompositeOperation = 'destination-out'; ribbon(B.blue, [[x - 90, y], [x - 20, y - 36], [x + 60, y - 14], [x + 100, y + 20]], 18, 4, '#000', x); B.blue.restore(); ribbon(B.key, [[x - 92, y + 4], [x - 20, y - 30], [x + 60, y - 10], [x + 102, y + 24]], 3, 2, COL.key, x + 1); }
  for (let i = 0; i < 3; i++) { const x = 1000 + i * 130, y = 160 + i * 28; line(B.key, [[x, y], [x + 12, y - 8], [x + 24, y]], 2.4); }
  seal(B, 110, SH - 100, 54, .05);
  return B;
}
function print3() {
  const B = newBlocks(), r = mulberry(33); border(B); const hz = 450;
  bokashi(B.grey, 36, 36, SW - 72, 500, COL.grey, 'down', 1, 31, .6); bokashi(B.blue, 36, 36, SW - 72, 300, COL.blue, 'down', .55, 32, 1.4); bokashi(B.ochre, 36, 310, SW - 72, 140, COL.ochre, 'up', .8, 33, .8);
  // towering flat clouds, scalloped edges
  for (let j = 0; j < 6; j++) { const y = 110 + j * 52, x0 = 880 + (j % 2) * 40 - j * 18, x1 = 1500 - (j % 3) * 30; B.pale.fillStyle = COL.pale; B.pale.beginPath(); B.pale.moveTo(x0, y + 40); for (let x = x0; x <= x1; x += 30) B.pale.arc(x + 15, y + 26, 28 + (vnoise(x / 70 + j) * 14), Math.PI, 0); B.pale.lineTo(x1, y + 42); B.pale.closePath(); B.pale.fill(); line(B.key, [[x0, y + 40], [x1, y + 42]], 3); }
  B.red.fillStyle = COL.red; B.red.beginPath(); B.red.arc(240, hz - 6, 40, Math.PI, 0); B.red.fill();
  line(B.key, [[36, hz], [SW - 36, hz]], 3);
  seaBase(B, hz, SH - 36); for (let j = 0; j < 7; j++) seaBand(B.blue, hz + 22 + j * 58, hz + 22 + j * 58 + 34 + j * 3, COL.blue, 62 + j * 20, 7 + j * 2.4, 40 + j, j * 53);
  for (let i = 0; i < 50; i++) { const x = 80 + r() * 1400, y = hz + 30 + r() * 380; line(B.key, [[x, y], [x + 40 + r() * 70, y + 2]], 1.8); }
  for (let i = 0; i < 4; i++) { const x = 600 + i * 90, y = 330 + (i % 2) * 24; line(B.key, [[x, y], [x + 9, y - 6], [x + 18, y]], 2.4); }
  seal(B, 110, SH - 100, 54, -.03);
  return B;
}
let CLAWS = [];
function clawList(seed, x, y, ang, len, w, depth, out, curl = .5) {
  const r = mulberry(seed), pts = [[x, y]]; let px = x, py = y, a = ang; const n = 7;
  for (let i = 1; i <= n; i++) { a += curl * (.16 + .1 * r()); px += Math.cos(a) * len / n; py += Math.sin(a) * len / n; pts.push([px, py]); }
  out.push({ pts, w }); if (depth > 0) for (const s of [-1, 1]) { const k = 3 + (r() * 2 | 0), q = pts[k]; clawList(seed * 7 + s * 13 + depth, q[0], q[1], a + s * (.7 + r() * .3), len * .55, w * .55, depth - 1, out, curl * s * .6); }
}
function print4() {
  const B = newBlocks(), r = mulberry(44); border(B); const hz = 330;
  bokashi(B.blue, 36, 36, SW - 72, 560, COL.blue, 'down', .95, 41, .8); bokashi(B.grey, 36, 36, SW - 72, 400, COL.grey, 'down', .6, 42, 1.0); bokashi(B.ochre, 36, 250, SW - 72, 110, COL.ochre, 'up', .55, 43, .8);
  line(B.key, [[36, hz + 60], [SW - 36, hz + 60]], 2.4);
  // distant peak
  poly(B.pale, [[1230, hz + 62], [1380, hz - 20], [1500, hz + 62]], COL.pale);
  // base sea
  seaBase(B, 560, SH - 36); for (let j = 0; j < 6; j++) seaBand(B.blue, 560 + j * 56, 560 + j * 56 + 40 + j * 3, COL.blue, 70 + j * 18, 9 + j * 3, 50 + j, j * 41);
  // the great wave: body, pale underside, claws of foam (paper), carved edge in key
  const crest = [[36, 800], [150, 560], [330, 330], [560, 190], [820, 190], [1040, 300], [1100, 430], [1010, 470]];
  const under = [[1010, 470], [860, 400], [700, 440], [540, 560], [380, 700], [220, 820], [36, 860]];
  poly(B.blue, [...crest, ...under], COL.blue, true); poly(B.pale, [[200, 800], [380, 600], [600, 480], [780, 430], [900, 440], [760, 520], [560, 650], [380, 800]], COL.pale, true);
  ribbon(B.key, [...crest], 5, 3.6, COL.key, 51, .3); ribbon(B.key, [...under], 3.6, 4, COL.key, 52, .3);
  CLAWS = []; const cs = [[430, 270, -2.2, 190], [560, 215, -1.6, 220], [690, 195, -1.1, 230], [830, 210, -.6, 210], [940, 250, -.2, 190], [1040, 330, .3, 150], [330, 340, -2.5, 160]];
  cs.forEach(([x, y, a, l], i) => clawList(100 + i, x, y, a, l, 46, 1, CLAWS, .6));
  B.blue.save(); B.blue.globalCompositeOperation = 'destination-out'; for (const c of CLAWS) ribbon(B.blue, c.pts, c.w, 3, '#000', 60 + c.w, .2, 6); B.blue.restore();
  for (const c of CLAWS) { line(B.key, c.pts.map(p => [p[0] + 2, p[1] + 2]), 2.2); }
  B.blue.save(); B.blue.globalCompositeOperation = 'destination-out'; B.blue.fillStyle = '#000'; for (let i = 0; i < 130; i++) { const a = r() * TAU, d = 30 + r() * 320, x = 740 + Math.cos(a) * d * 1.4, y = 230 + Math.sin(a) * d * .5 - 30; if (y > 80 && x < 1400) { B.blue.beginPath(); B.blue.arc(x, y, 2 + r() * 4.5, 0, TAU); B.blue.fill(); } } B.blue.restore();
  for (let i = 0; i < 40; i++) { const x = 60 + r() * 1400, y = 640 + r() * 200; line(B.key, [[x, y], [x + 40 + r() * 60, y + 2]], 1.8); }
  seal(B, 110, SH - 100, 54, .08);
  return B;
}
function print5() {
  const B = newBlocks(), r = mulberry(55); border(B); const hz = 440;
  bokashi(B.pale, 36, 36, SW - 72, 260, COL.pale, 'down', .35, 61); bokashi(B.ochre, 36, 330, SW - 72, 110, COL.ochre, 'up', .45, 62);
  B.ochre.fillStyle = COL.ochre; B.ochre.beginPath(); B.ochre.arc(1230, 230, 48, 0, TAU); B.ochre.fill(); line(B.key, [[1182, 230], [1190, 200], [1220, 184]], 2); // a pale moon
  line(B.key, [[36, hz], [SW - 36, hz]], 3);
  seaBase(B, hz, 640); for (let j = 0; j < 3; j++) seaBand(B.blue, hz + 40 + j * 50, hz + 40 + j * 50 + 22, COL.blue, 110 + j * 30, 6 + j * 2, 70 + j, j * 30);
  for (let i = 0; i < 14; i++) { const x = 100 + r() * 1300, y = hz + 22 + r() * 160; line(B.key, [[x, y], [x + 70 + r() * 80, y + 1]], 1.7); }
  poly(B.ochre, [[36, 640], [520, 610], [1100, 630], [SW - 36, 580], [SW - 36, SH - 36], [36, SH - 36]], '#e6bf6a', true); ribbon(B.key, [[36, 640], [520, 610], [1100, 630], [SW - 36, 580]], 4.2, 3.4, COL.key, 63);
  // boat pulled up, fisherman sitting small, back to us; the old woman with the lamp
  poly(B.ochre, [[330, 690], [640, 670], [610, 720], [370, 726]], '#c58b33'); ribbon(B.key, [[330, 690], [370, 726], [610, 720], [640, 670], [330, 690]], 4, 4, COL.key, 64);
  poly(B.blue, [[700, 690], [760, 690], [776, 740], [690, 740]], COL.blue); ribbon(B.key, [[700, 690], [690, 740], [776, 740], [760, 690]], 3, 3, COL.key, 65); B.ochre.fillStyle = COL.ochre; B.ochre.beginPath(); B.ochre.ellipse(730, 676, 26, 10, 0, 0, TAU); B.ochre.fill(); line(B.key, [[706, 676], [730, 662], [754, 676]], 3);
  figure(B, 1100, 740, 1.0, 'old');
  pad(B, 1380, 560, 240, 90, 66); ribbon(B.key, [[1380, 600], [1370, 700], [1390, 780]], 24, 12, COL.key, 67); pad(B, 1300, 640, 200, 70, 68);
  seal(B, 110, SH - 100, 54, -.05);
  return B;
}
function applyTexture() { for (const B of BL) texture(B); }
function compose(i, t, opt = {}) {
  const c = FIN[i]._work || (FIN[i]._work = mkc(SW, SH)), g = c.getContext('2d'); g.clearRect(0, 0, SW, SH); g.drawImage(PAP, 0, 0);
  const B = BL[i];
  for (const n of ORDER) {
    const o = opt.prog?.[n]; let p = o ? seg(t, o[0], o[1]) : 1; if (p <= 0) continue;
    const sh = opt.shock ? opt.shock : 0, [dx, dy] = REG[n], k = (1 - ss(p)) * -6;
    g.save();
    if (p < 1) { // diagonal baren sweep, noisy edge
      const e = lerp(-300, SW + SH, p); g.beginPath(); g.moveTo(-40, -40); for (let y = 0; y <= SH; y += 30) g.lineTo(e - y * .6 + (vnoise(y / 60 + n.length) - .5) * 70, y); g.lineTo(-40, SH); g.closePath(); g.clip();
    }
    g.drawImage(B._c[n], dx * (1 + sh * 3) + k, dy * (1 + sh * 3) + sh * (n === 'blue' ? 5 : n === 'red' ? -4 : 0));
    g.restore();
  }
  return c;
}
let BUILT = false;
function buildAll() {
  makeTextures();
  BL.push(print1(), print2(), print4()); applyTexture();
  for (let i = 0; i < NP; i++) { FIN[i] = {}; const c = mkc(SW, SH), g = c.getContext('2d'); g.drawImage(PAP, 0, 0); for (const n of ORDER) g.drawImage(BL[i]._c[n], REG[n][0], REG[n][1]); FIN[i].c = c; CART[i] = cartouche(i); }
  BUILT = true;
}

/* ------------------------------------------------------------------ world, camera */
const cX = i => i * PITCH + SW / 2;
function camera(t) {
  // opening: an extreme crop on the tip of the old woman's stick (woodgrain fills the frame), pulling back to find the first sheet
  const u0 = eio(seg(t, .3, 8.8));
  let z = lerp(6.0, 1, u0), cx = lerp(FOCUS0[0], SW / 2, u0), cy = lerp(FOCUS0[1], SH / 2, u0);
  // two slow pans across the triptych: no cuts, no slides
  const p1 = eio(seg(t, PANS[0][0], PANS[0][1])), p2 = eio(seg(t, PANS[1][0], PANS[1][1]));
  cx += (cX(1) - cX(0)) * p1 + (cX(2) - cX(1)) * p2;
  // the crash-zoom into the texture at the storm's peak: the medium itself becomes the image
  const p4 = ss(seg(t, 41, 41.7)) * (1 - ss(seg(t, 42.7, 43.9)));
  z += 4.2 * p4; cx += (700 - SW / 2) * p4; cy += (330 - SH / 2) * p4;
  // pull-back: the three sheets seen whole
  const p5 = ss(seg(t, 46, 52));
  z = lerp(z, .36, p5); cx = lerp(cx, cX(1), p5); cy = lerp(cy, SH / 2 + 30, p5);
  return { cx, cy, z };
}
/* ------------------------------------------------------------------ dynamic bits (steps at 8 fps, rain at 12 fps) */
function drawBoat(g, x, y, s, t, rock) {
  const f8 = Math.floor(t * 8), bob = (f8 % 2) * 1.6 * s, ang = rock ? ((f8 % 3) - 1) * rock : 0;
  g.save(); g.translate(x, y + bob); g.rotate(ang);
  g.fillStyle = '#c58b33'; g.beginPath(); g.moveTo(-58 * s, 0); g.lineTo(58 * s, 0); g.lineTo(44 * s, 22 * s); g.lineTo(-44 * s, 22 * s); g.closePath(); g.fill(); g.strokeStyle = COL.key; g.lineWidth = 3.6 * s; g.stroke();
  g.fillStyle = '#efe3c8'; g.beginPath(); g.moveTo(0, -6 * s); g.lineTo(0, -86 * s); g.lineTo(40 * s, -12 * s); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -86 * s); g.lineTo(0, 0); g.stroke();
  g.fillStyle = COL.blue; g.fillRect(-26 * s, -22 * s, 14 * s, 22 * s); g.fillStyle = COL.ochre; g.beginPath(); g.ellipse(-19 * s, -26 * s, 12 * s, 4 * s, 0, 0, TAU); g.fill(); g.restore();
}
function drawRain(g, t, a, x0, y0, w, h) {
  const fr = Math.floor(t * 12), r = mulberry(fr * 131 + 7); g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip(); g.lineCap = 'round';
  for (const [ang, n, col] of [[.16, 100, `rgba(29,45,76,${.42 * a})`], [.23, 80, `rgba(29,45,76,${.3 * a})`]]) for (let i = 0; i < n; i++) { const x = x0 + r() * (w + 200) - 100, y = y0 + r() * (h + 100) - 50, l = 70 + r() * 80; g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x - l * ang, y + l); g.stroke(); }
  g.restore();
}
/* ------------------------------------------------------------------ frame */
function drawPrint(i, t) {
  const x0 = i * PITCH; let sheet = FIN[i].c;
  if (i === 2 && t >= 39.6 && t < 40.5) sheet = compose(2, t, { shock: 1 - seg(t, 39.6, 40.5) });      // the blocks land out of register at the crash, then settle
  ctx.save(); ctx.translate(x0, 0);
  ctx.fillStyle = 'rgba(40,28,12,.28)'; ctx.fillRect(8, 10, SW, SH);
  ctx.drawImage(sheet, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, SW, SH); ctx.clip();
  if (i === 0) {
    const f = Math.floor(t * 8); for (let k = 0; k < 2; k++) { const gx = ((t * 18 + k * 400) % 1700) - 100, gy = 150 + k * 60 + Math.sin(f * .7 + k) * 8; ctx.strokeStyle = COL.key; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx - 16, gy + 6); ctx.quadraticCurveTo(gx - 6, gy - (f % 2 ? 8 : 2), gx, gy); ctx.quadraticCurveTo(gx + 6, gy - (f % 2 ? 8 : 2), gx + 16, gy + 6); ctx.stroke(); }
    const lamp = ss(seg(t, 47, 49.5));                                                                                           // the old woman lights her lamp (it stays lit to the end)
    if (lamp > 0) { const f12 = Math.floor(t * 12), fl = .85 + .15 * Math.sin(f12 * 2.3) * Math.sin(f12 * .9), lx = 612, ly = 618; const gr = ctx.createRadialGradient(lx, ly, 4, lx, ly, 320 * fl); gr.addColorStop(0, `rgba(250,190,70,${.95 * lamp * fl})`); gr.addColorStop(.35, `rgba(240,160,50,${.55 * lamp * fl})`); gr.addColorStop(1, 'rgba(240,160,50,0)'); ctx.fillStyle = gr; ctx.fillRect(lx - 340, ly - 340, 680, 680); ctx.fillStyle = COL.red; ctx.globalAlpha = lamp; ctx.beginPath(); ctx.ellipse(lx, ly, 14, 19, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = COL.key; ctx.lineWidth = 2.4; ctx.stroke(); line(ctx, [[600, 606], [612, 580]], 2.6); ctx.globalAlpha = 1; }
  }
  if (i === 1) { drawBoat(ctx, 480 + clamp(t - 15, 0, 45) * 14, 592, 1.0, t, 0); const a = ss(seg(t, 25.5, 27.5)) * (1 - ss(seg(t, 44, 47))) * .7; if (a > 0) drawRain(ctx, t, a, 36, 36, SW - 72, SH - 72); }
  if (i === 2) { drawBoat(ctx, 1180, 650, .9, t, .08); const a = t < 44 ? 1 : ss(1 - seg(t, 44, 47)) * .85 + .15; if (t > 31) drawRain(ctx, t, a, 36, 36, SW - 72, SH - 72); if (t > 36.9 && t < 37.1) { ctx.fillStyle = 'rgba(240,230,205,.82)'; ctx.fillRect(0, 0, SW, SH); } }
  ctx.restore();
  const a = ss(seg(t, ART[i], ART[i] + .5)); if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(CART[i], SW - 215, 62 - (1 - a) * 18); ctx.globalAlpha = 1; }
  ctx.restore();
}
function drawSub(t) {
  for (const v of VOICE) {
    const t1 = subEnd(v); if (t < v.t || t > t1 + .3) continue;
    const a = ss(seg(t, v.t, v.t + .3)) * (1 - ss(seg(t, t1 - .15, t1 + .25)));
    ctx.save(); ctx.globalAlpha = a; ctx.font = '500 38px Shippori'; ctx.textAlign = 'center';
    const words = v.text.split(' '); let l1 = v.text, l2 = ''; if (ctx.measureText(v.text).width > 1250) { let best = 1e9; for (let i = 3; i < words.length - 2; i++) { const a1 = words.slice(0, i).join(' '), a2 = words.slice(i).join(' '), d = Math.abs(ctx.measureText(a1).width - ctx.measureText(a2).width); if (d < best) { best = d; l1 = a1; l2 = a2; } } }
    const lines = l2 ? [l1, l2] : [l1], wmax = Math.max(...lines.map(l => ctx.measureText(l).width)), bw = wmax + 150, bh = lines.length * 50 + 34, bx = W / 2 - bw / 2, by = 995 - bh;
    ctx.fillStyle = '#f2e7cb'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = COL.key; ctx.lineWidth = 5; ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6); ctx.lineWidth = 1.8; ctx.strokeRect(bx + 11, by + 11, bw - 22, bh - 22);
    ctx.fillStyle = COL.red; ctx.fillRect(bx + 24, by + bh / 2 - 17, 34, 34); ctx.fillStyle = '#f2e7cb'; ctx.fillRect(bx + 31, by + bh / 2 - 9, 20, 3); ctx.fillRect(bx + 38, by + bh / 2 - 6, 6, 18);
    ctx.fillStyle = COL.key; ctx.textBaseline = 'alphabetic'; lines.forEach((ln, i) => ctx.fillText(ln, W / 2 + 22, by + 46 + i * 50)); ctx.restore();
  }
}
function finalSeal(t) {
  const u = seg(t, 58.6, 58.8); if (u <= 0) return; const s = lerp(1.35, 1, ss(u)), z = 150;
  ctx.save(); ctx.translate(W / 2, 520); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, u * 3); ctx.fillStyle = COL.red; ctx.fillRect(-z / 2, -z / 2, z, z);
  ctx.fillStyle = WASHI; ctx.beginPath(); ctx.moveTo(-z * .28, z * .12); ctx.lineTo(z * .28, z * .12); ctx.lineTo(z * .18, z * .28); ctx.lineTo(-z * .2, z * .28); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -z * .3); ctx.lineTo(z * .22, z * .06); ctx.lineTo(-z * .02, z * .06); ctx.closePath(); ctx.fill(); ctx.fillRect(-z * .35, z * .32 - 3, z * .7, 3);
  const r = mulberry(9); for (let i = 0; i < 46; i++) ctx.fillRect(-z / 2 + r() * z, -z / 2 + r() * z, 3 + r() * 5, 2 + r() * 3); ctx.restore();
}
function render(t) {
  if (!BUILT) return;
  const cam = camera(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#c3aa7c'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.cx * cam.z, H / 2 - cam.cy * cam.z);
  const pat = ctx.createPattern(MOUNT, 'repeat'); ctx.fillStyle = pat; ctx.fillRect(-4000, -2000, NP * PITCH + 8000, SH + 4000);
  for (let i = 0; i < NP; i++) { const sx = (i * PITCH - cam.cx) * cam.z + W / 2; if (sx > W + 400 || sx + SW * cam.z < -400) continue; drawPrint(i, t); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // final wash back to paper, then the seal alone
  const wu = seg(t, 56.6, 58.6); if (wu > 0) { const edge = H + 120 - (H + 300) * eio(wu); ctx.fillStyle = WASHI; ctx.beginPath(); ctx.moveTo(0, H + 40); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, edge + 26 * Math.sin(x * .006 + 1) + 14 * (vnoise(x / 80) - .5)); ctx.lineTo(W, H + 40); ctx.closePath(); ctx.fill(); if (wu >= 1) ctx.fillRect(0, 0, W, H); }
  if (t >= 56.6 && t < 58.7) { const pp = ss(seg(t, 58.4, 58.7)); if (pp > 0) { ctx.globalAlpha = pp; ctx.drawImage(PAP, 0, 0, W, H); ctx.globalAlpha = 1; } }
  drawSub(t); finalSeal(t);
}
window.render = render;
window.TEXTS = t => { const o = []; for (let i = 0; i < NP; i++) if (t > ART[i] + .6 && t < LEAVE[i]) o.push({ id: 'cart' + i, text: `No. ${i + 1} ${TITLES[i]}`, x0: 1475, y0: 150, x1: 1600, y1: 640 }); return o; };
function buildEV() {
  const ev = []; VOICE.forEach(v => ev.push({ t: v.t, type: 'voice', id: v.id }));
  ev.push({ t: .4, type: 'baren', n: 'grain' }, { t: 3.0, type: 'baren', n: 'grain' });                       // the crop on the woodgrain is felt as a slow rub
  ART.forEach(t => ev.push({ t, type: 'drop' }));
  PANS.forEach(([a, b]) => ev.push({ t: a, type: 'slide', d: b - a, i: 1 }));
  ev.push({ t: 25.5, type: 'rainstart' }, { t: 28.5, type: 'clappers' }, { t: 37.0, type: 'thunder' }, { t: 38.2, type: 'sawari' }, { t: 39.6, type: 'crash' }, { t: 41.0, type: 'zoom' }, { t: 42.7, type: 'zoomout' }, { t: 47.0, type: 'lamp' }, { t: 56.6, type: 'wash' }, { t: 58.6, type: 'seal2' });
  return ev.sort((a, b) => a.t - b.t);
}
async function init() {
  await Promise.all(['500 38px Shippori', '700 38px Shippori', '40px Yuji'].map(f => document.fonts.load(f)));
  buildAll(); window.EV = buildEV(); window.READY = true;
}
init();
