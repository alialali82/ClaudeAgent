import { clamp, lerp, seg, ss, mulberry, hash, TAU } from '/core/lib.js';

/* ========================================================================= setup */
const FW = 320, FH = 180, DUR = 60;
window.DUR = DUR;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const off = document.createElement('canvas'); off.width = FW; off.height = FH; const octx = off.getContext('2d');
const fb = new Uint8Array(FW * FH);
let T = { d: fb, w: FW, h: FH, ox: 0, oy: 0 };

// ENDESGA-32 master palette (free) + 3 protected duplicates (coin gold, coin light, kite red) that no table touches
const HEX = 'be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569 feae34 fee761 e43b44'.split(' ');
const PAL = HEX.map(h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const [RUST, ORANGE, CREAM, TAN, CLAY, BROWN, DBROWN, DRED, RED, BORANGE, GOLDM, YELLOWM, GREEN, DGREEN, FOREST, DTEAL, BLUE, SKY, CYAN, WHITE, SILVER, GREY, SLATE, DUSK, NIGHT, INK, HOTRED, PLUM, MAGENTA, PINK, SKIN, SKIN2, GOLD, GOLDL, KITE] = Array.from({ length: 35 }, (_, i) => i);
const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
const hsl2rgb = ([h, s, l]) => { h = ((h % 360) + 360) % 360 / 360; const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; };
const mixrgb = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const xform = fn => PAL.map((c, i) => i >= 32 ? c : fn(c));
const LUTS = {
  summer: PAL,
  spring: xform(c => { const [h, s, l] = rgb2hsl(c); const g = h > 70 && h < 170; return mixrgb(hsl2rgb([g ? 98 : h, Math.min(1, s * 1.05), Math.min(1, l + .05)]), [255, 245, 222], .12); }),
  autumn: xform(c => { const [h, s, l] = rgb2hsl(c); if (h > 70 && h < 170) return hsl2rgb([lerp(26, 40, (h - 70) / 100), Math.min(1, s * 1.05), l * 1.02]); if (h > 170 && h < 250) return mixrgb(hsl2rgb([h, s * .6, l]), [200, 160, 120], .18); return mixrgb(c, [255, 200, 140], .06); }),
  winter: xform(c => { const [h, s, l] = rgb2hsl(c); const warm = h < 50 || h > 330; return mixrgb(hsl2rgb([h, s * (warm ? .8 : .42), l * .96]), [140, 165, 215], warm ? .1 : .24); }),
};
const lutMix = (a, b, k) => k <= 0 ? a : k >= 1 ? b : a.map((c, i) => mixrgb(c, b[i], k));
const BLACKL = PAL.map(() => PAL[INK]);
const q4 = u => Math.floor(clamp(u) * 4) / 4;

/* ========================================================================= primitives */
const px = (x, y, c) => { x = (x | 0) + T.ox; y = (y | 0) + T.oy; if (x >= 0 && x < T.w && y >= 0 && y < T.h) T.d[y * T.w + x] = c; };
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
const disc = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * .6) px(cx + x, cy + y, c); };
const ell = (cx, cy, rx, ry, c) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + .5) + (y * y) / (ry * ry + .5) <= 1) px(cx + x, cy + y, c); };
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + .5) / 16;
const line = (x0, y0, x1, y1, c) => { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (; ;) { px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
function vramp(x, y, w, h, cols) { // vertical dithered ramp through the colours
  const n = cols.length - 1;
  for (let j = 0; j < h; j++) { const u = j / Math.max(1, h - 1) * n, i = Math.min(n - 1, Math.floor(u)), k = u - i; for (let a = 0; a < w; a++) px(x + a, y + j, bay(x + a, y + j) < k ? cols[i + 1] : cols[i]); }
}
function mkSprite(w, h, fn, outline = true) {
  const s = { w: w + 2, h: h + 2, d: new Uint8Array((w + 2) * (h + 2)).fill(255) }; const old = T; T = { d: s.d, w: s.w, h: s.h, ox: 1, oy: 1 }; fn(); T = old;
  if (outline) { const o = s.d.slice(); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.d[y * s.w + x] === 255) { const nb = (xx, yy) => xx >= 0 && yy >= 0 && xx < s.w && yy < s.h && s.d[yy * s.w + xx] !== 255; if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) o[y * s.w + x] = INK; } s.d = o; }
  return s;
}
function blit(s, x, y, flip = false) { x = (x | 0) - 1; y = (y | 0) - 1; for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const c = s.d[j * s.w + (flip ? s.w - 1 - i : i)]; if (c !== 255) px(x + i, y + j, c); } }
function blitScaled(s, cx, cy, k) { // nearest-neighbour shrink about a centre, for the enemy fading away
  const W2 = Math.max(1, Math.round(s.w * k)), H2 = Math.max(1, Math.round(s.h * k)); for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) { const c = s.d[Math.floor(j / k) * s.w + Math.floor(i / k)]; if (c !== 255 && c !== undefined) px(cx - (W2 >> 1) + i, cy - (H2 >> 1) + j, c); }
}

/* ========================================================================= text */
const tcv = document.createElement('canvas'); tcv.width = 330; tcv.height = 10; const tctx = tcv.getContext('2d', { willReadFrequently: true });
const gcache = new Map();
function glyphs(str) {
  if (gcache.has(str)) return gcache.get(str);
  tctx.clearRect(0, 0, 330, 10); tctx.font = '8px PS2P'; tctx.fillStyle = '#fff'; tctx.textBaseline = 'top'; tctx.fillText(str, 0, 0);
  const d = tctx.getImageData(0, 0, 330, 10).data, pts = []; for (let y = 0; y < 10; y++) for (let x = 0; x < 330; x++) if (d[(y * 330 + x) * 4 + 3] > 110) pts.push([x, y]);
  gcache.set(str, pts); return pts;
}
function text(str, x, y, c = WHITE, sh = INK, s = 1) {
  const g = glyphs(str);
  if (sh >= 0) for (const [a, b] of g) rect(x + a * s + s, y + b * s + s, s, s, sh);
  if (s > 1) { for (const [a, b] of g) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) rect(x + a * s + dx, y + b * s + dy, s, s, INK); }
  for (const [a, b] of g) rect(x + a * s, y + b * s, s, s, c);
}
const tw = (str, s = 1) => str.length * 8 * s;
function wrap(str, n = 31) { const words = str.split(' '), out = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; }
function win(x, y, w, h) {
  rect(x + 1, y, w - 2, h, INK); rect(x, y + 1, w, h - 2, INK); rect(x + 2, y + 1, w - 4, h - 2, WHITE); rect(x + 1, y + 2, w - 2, h - 4, WHITE);
  rect(x + 3, y + 2, w - 6, h - 4, SILVER); rect(x + 2, y + 3, w - 4, h - 6, SILVER);
  for (let j = 4; j < h - 4; j++) for (let i = 4; i < w - 4; i++) px(x + i, y + j, bay(x + i, y + j) < (j / h) * .7 ? DUSK : BLUE);
}

/* ========================================================================= timeline */
const VOICE = [
  { id: 'v1', t: 5.0, d: 2.179, text: 'One coin a day. That is the whole plan.', who: 'boy' },
  { id: 'v2', t: 11.6, d: 2.811, text: 'Spring. Summer. Autumn. I did not skip a single day.', who: 'boy' },
  { id: 'v3', t: 27.6, d: 2.812, text: 'Then winter, and every shop was singing for my coin.', who: 'boy', top: true },
  { id: 'v4', t: 34.0, d: 1.633, text: 'Not today. I am saving.', who: 'boy', top: true },
  { id: 'v5', t: 42.2, d: 2.054, text: 'Day 365.', who: 'boy' },
  { id: 'v6', t: 49.4, d: 1.603, text: 'One red kite, please.', who: 'boy' },
  { id: 'v7', t: 56.0, d: 1.426, text: 'Worth every day.', who: 'boy' },
];
const SHOP = [{ id: 's1', t: 46.8, d: 2.1, text: '365 G. Ready to buy?', who: 'shop' }];
const MSGS = [{ id: 'm1', t: 36.3, d: 2.3, text: 'Temptation fades away.', top: true }];
const hold = v => Math.max(1.8, v.d + .6);
window.VOICE = VOICE;
const dayAt = t => t < 9.4 ? 0 : t < 11.2 ? 1 : t < 15 ? lerp(1, 92, seg(t, 11.2, 15)) : t < 18.8 ? lerp(92, 183, seg(t, 15, 18.8)) : t < 22.6 ? lerp(183, 274, seg(t, 15 + 3.8, 22.6)) : t < 26.8 ? lerp(274, 300, seg(t, 22.6, 26.2)) : t < 45.2 ? 364 : 365;
const goldAt = t => t < 9.4 ? 0 : t < 26.8 ? Math.floor(dayAt(t)) : t < 45.2 ? (t < 38 ? 300 : 301) : t < 51.8 ? 365 : t < 53.2 ? Math.max(0, Math.round(365 * (1 - seg(t, 51.8, 53.2)))) : 0;
const sceneAt = t => t < 3.7 ? 'title' : t < 10.9 ? 'room' : t < 26.8 ? 'road' : t < 41.4 ? 'battle' : t < 42.2 ? 'black' : t < 46.6 ? 'room2' : t < 55.6 ? 'shop' : 'hill';
const seasonAt = t => t < 15 ? 'spring' : t < 18.8 ? 'summer' : t < 22.6 ? 'autumn' : 'winter';

/* ========================================================================= sprites */
const SPR = {};
const spr = (k, w, h, fn, o) => SPR[k] || (SPR[k] = mkSprite(w, h, fn, o));
function boy(f) {
  return spr('boy' + f, 18, 28, () => {
    const L = [[-1, 1], [0, 0], [1, -1], [0, 0]][f & 3], sw = [0, 1, 0, -1][f & 3];
    rect(0 + sw, 12, 6, 2, RED); rect(-1 + sw, 14, 3, 2, DRED);                    // scarf tail (the silhouette mark)
    rect(7 + L[0], 21, 3, 6, BROWN); rect(11 + L[1], 21, 3, 6, BROWN); rect(7 + L[0], 26, 3, 2, DBROWN); rect(11 + L[1], 26, 3, 2, DBROWN);
    rect(5, 12, 10, 9, BLUE); rect(5, 12, 2, 9, DUSK); rect(5, 19, 10, 1, BROWN); rect(11, 14, 2, 5, BLUE); rect(11, 19, 2, 2, SKIN);
    ell(9, 7, 5, 5, SKIN); rect(4, 2, 11, 4, BROWN); px(5, 1, BROWN); px(8, 0, BROWN); px(11, 1, BROWN); px(14, 3, BROWN); px(3, 4, BROWN);
    px(12, 7, INK); px(12, 9, PINK); rect(5, 11, 10, 2, RED);
  });
}
function boyBack() {
  return spr('boyb', 18, 28, () => {
    rect(6, 22, 3, 5, BROWN); rect(10, 22, 3, 5, BROWN); rect(6, 26, 3, 2, DBROWN); rect(10, 26, 3, 2, DBROWN);
    rect(4, 12, 11, 10, BLUE); rect(4, 12, 11, 2, DUSK); rect(2, 14, 2, 6, BLUE); rect(15, 14, 2, 6, BLUE); rect(2, 20, 2, 2, SKIN); rect(15, 20, 2, 2, SKIN);
    ell(9, 7, 5, 6, BROWN); px(5, 1, BROWN); px(9, 0, BROWN); px(13, 1, BROWN); rect(4, 11, 11, 2, RED); rect(10, 13, 2, 8, RED);
  });
}
function slime(f) {
  return spr('slime' + f, 44, 40, () => {
    const sq = f ? 1 : 0;
    ell(22, 27 + sq, 19 + sq, 11 - sq, PINK); ell(22, 31 + sq, 19, 7, MAGENTA); ell(22, 24 + sq, 18, 9 - sq, PINK);
    rect(15, 15 + sq, 14, 4, WHITE); rect(17, 12 + sq, 10, 3, WHITE); rect(19, 10 + sq, 6, 2, WHITE); disc(22, 8 + sq, 3, RED); line(23, 5 + sq, 27, 1, DGREEN);
    for (const [a, b] of [[8, 22], [34, 21], [12, 33], [30, 34], [24, 28]]) px(a, b + sq, [YELLOWM, SKY, GREEN, WHITE, ORANGE][(a + b) % 5]);
    disc(14, 24 + sq, 3, WHITE); disc(30, 24 + sq, 3, WHITE); px(15, 25 + sq, INK); px(29, 25 + sq, INK); px(14, 24 + sq, INK); px(30, 24 + sq, INK);
    for (let i = 0; i < 10; i++) px(17 + i, 30 + sq + (Math.abs(i - 4.5) < 4 ? 1 : 0) - (i % 2 ? 0 : 0), DRED);
  });
}
function kiteSpr() {
  return spr('kite', 22, 26, () => {
    for (let y = 0; y < 25; y++) { const hw = y < 10 ? 1 + y * 1.0 : (24 - y) * .72 + .5; rect(Math.round(11 - hw), y, Math.round(hw * 2), 1, KITE); }
    for (let y = 2; y < 24; y++) px(11, y, DBROWN); line(2, 10, 20, 10, DBROWN); rect(9, 3, 4, 1, WHITE); rect(6, 8, 3, 1, WHITE); rect(14, 8, 3, 1, WHITE); rect(9, 14, 4, 1, GOLDL);
  });
}
function shopkeeper() {
  return spr('shopk', 26, 34, () => {
    rect(5, 18, 16, 16, BROWN); rect(8, 18, 10, 16, WHITE); rect(8, 18, 10, 2, SILVER); ell(13, 10, 6, 7, SKIN); rect(6, 3, 14, 4, SILVER); px(7, 8, SILVER); px(19, 8, SILVER);
    px(10, 9, INK); px(16, 9, INK); rect(9, 12, 8, 2, GREY); rect(2, 20, 3, 8, BROWN); rect(21, 20, 3, 8, BROWN);
  });
}
function portrait(kind, expr, x, y) {
  rect(x, y, 32, 32, 25); rect(x + 1, y + 1, 30, 30, kind === 'boy' ? SLATE : DUSK);
  if (kind === 'boy') {
    ell(x + 16, y + 18, 10, 11, SKIN); rect(x + 5, y + 5, 22, 6, BROWN); for (const a of [7, 12, 17, 22]) px(x + a, y + 4 - (a % 2), BROWN); rect(x + 5, y + 9, 3, 6, BROWN); rect(x + 24, y + 9, 3, 6, BROWN);
    rect(x + 11, y + 17, 2, 3, INK); rect(x + 20, y + 17, 2, 3, INK); px(x + 11, y + 17, WHITE);
    if (expr === 'determined') { line(x + 9, y + 13, x + 14, y + 15, DBROWN); line(x + 23, y + 13, x + 18, y + 15, DBROWN); rect(x + 12, y + 25, 8, 1, DRED); }
    else if (expr === 'smile') { rect(x + 10, y + 13, 4, 1, DBROWN); rect(x + 19, y + 13, 4, 1, DBROWN); rect(x + 12, y + 25, 8, 1, DRED); px(x + 11, y + 24, DRED); px(x + 20, y + 24, DRED); }
    else { rect(x + 10, y + 14, 4, 1, DBROWN); rect(x + 19, y + 14, 4, 1, DBROWN); rect(x + 14, y + 25, 4, 1, DRED); }
    px(x + 9, y + 22, PINK); px(x + 10, y + 22, PINK); px(x + 22, y + 22, PINK); px(x + 23, y + 22, PINK); rect(x + 6, y + 29, 20, 3, RED);
  } else {
    ell(x + 16, y + 18, 10, 11, SKIN); rect(x + 5, y + 6, 22, 5, SILVER); rect(x + 4, y + 9, 4, 8, SILVER); rect(x + 24, y + 9, 4, 8, SILVER);
    rect(x + 11, y + 17, 2, 2, INK); rect(x + 20, y + 17, 2, 2, INK); rect(x + 9, y + 14, 6, 1, GREY); rect(x + 18, y + 14, 6, 1, GREY);
    rect(x + 10, y + 22, 12, 3, GREY); rect(x + 12, y + 26, 8, 1, DRED); rect(x + 6, y + 29, 20, 3, WHITE);
  }
}
function coin(x, y, f) { const w = [6, 4, 2, 4][f & 3]; rect(x + (6 - w) / 2, y, w, 6, GOLD); if (w > 2) { px(x + (6 - w) / 2, y, GOLDL); px(x + (6 - w) / 2, y + 1, GOLDL); px(x + (6 + w) / 2 - 1, y + 5, GOLDL); } rect(x + (6 - w) / 2 - (w > 3 ? 0 : 0), y + 6, w, 1, INK); }
function jar(x, y, fill, shake = 0) {
  x += shake; rect(x + 3, y, 16, 4, BROWN); rect(x + 3, y, 16, 1, CLAY); rect(x + 2, y + 4, 18, 2, SILVER);
  rect(x, y + 6, 22, 26, INK); for (let j = 0; j < 24; j++) for (let i = 0; i < 20; i++) px(x + 1 + i, y + 7 + j, ((i + j) & 1) ? SILVER : WHITE);
  const h = Math.floor(fill * 22);
  for (let j = 0; j < h; j++) for (let i = 0; i < 20; i++) { const yy = y + 29 - j; px(x + 1 + i, yy, ((i * 3 + j) % 6 === 0) ? GOLDL : (j === h - 1 && bay(i, j) > .5 ? SILVER : GOLD)); }
  rect(x + 3, y + 8, 1, 10, WHITE); rect(x + 5, y + 8, 1, 3, WHITE);
}
function hand(x, y, bob) { const o = bob ? 1 : 0; rect(x + o, y + 2, 5, 3, WHITE); rect(x + o + 3, y, 3, 7, WHITE); rect(x + o + 6, y + 2, 2, 3, WHITE); px(x + o + 7, y + 3, WHITE); rect(x + o - 1, y + 1, 1, 5, INK); }

/* ========================================================================= scenes */
function stars(n, seed, y1) { const r = mulberry(seed); for (let i = 0; i < n; i++) { const x = r() * FW | 0, y = r() * y1 | 0, tw = (Math.floor(TIME * 2 + i) % 5 === 0); px(x, y, tw ? 19 : 21); } }
let TIME = 0;
function titleScene(t) {
  vramp(0, 0, FW, 120, [NIGHT, DUSK, SLATE]); stars(40, 3, 70);
  disc(262, 28, 10, YELLOWM); disc(266, 25, 9, SLATE === 0 ? 0 : DUSK); // moon with a bite
  for (let x = 0; x < FW; x++) { const h = 96 + Math.sin(x / 38) * 8 + Math.sin(x / 13) * 3; rect(x, h | 0, 1, 90, DTEAL); } for (let x = 0; x < FW; x++) { const h = 112 + Math.sin(x / 26 + 2) * 5; rect(x, h | 0, 1, 70, FOREST); }
  rect(0, 126, FW, 54, BROWN); for (let x = 0; x < FW; x += 2) px(x + (x % 3), 130 + (x % 7), CLAY);
  const bx = lerp(-20, 340, seg(t, .3, 3.5)); blit(boy(Math.floor(t * 8) & 3), bx, 98);
  coin(157, 22 + Math.round(Math.sin(t * 3) * 1.5), Math.floor(t * 8) & 3);
  text('A COIN A DAY', 64, 46, GOLD, INK, 2);
  text('~ A QUEST OF 365 DAYS ~', 64, 76, SILVER);
  if (Math.floor(t * 2.2) % 2 === 0 && t > 1.2) text('PRESS START', 116, 150, WHITE);
}
function roomScene(t, second) {
  rect(0, 0, FW, 100, CREAM); rect(0, 68, FW, 32, TAN); rect(0, 66, FW, 3, CLAY);
  for (let x = 12; x < FW; x += 40) rect(x, 72, 22, 24, CLAY);
  rect(0, 100, FW, 80, BROWN); for (let x = 0; x < FW; x += 26) rect(x, 100, 1, 80, DBROWN); for (let y = 100; y < 180; y += 20) rect(0, y, FW, 1, DBROWN); rect(0, 98, FW, 2, DBROWN);
  // window
  rect(38, 14, 60, 48, DBROWN); rect(41, 17, 54, 42, second ? NIGHT : SKY);
  if (second) { vramp(41, 17, 54, 42, [NIGHT, DUSK]); for (let i = 0; i < 14; i++) px(43 + (i * 13) % 50, 19 + (Math.floor(t * 12 + i * 5) * 7) % 38, WHITE); }
  else { vramp(41, 17, 54, 42, [SKY, CYAN]); disc(84, 28, 5, YELLOWM); rect(46, 40, 18, 5, WHITE); rect(52, 37, 12, 4, WHITE); }
  rect(67, 17, 2, 42, DBROWN); rect(41, 37, 54, 2, DBROWN);
  rect(34, 62, 68, 4, CLAY);
  // bed
  rect(6, 80, 76, 6, CLAY); rect(6, 74, 10, 24, BROWN); rect(10, 78, 70, 14, BLUE); rect(10, 78, 70, 3, SKY); rect(10, 70, 18, 10, WHITE); rect(10, 70, 18, 2, SILVER); rect(8, 92, 4, 10, DBROWN); rect(76, 92, 4, 10, DBROWN);
  // shelf + table
  rect(128, 40, 60, 3, DBROWN); for (let i = 0; i < 6; i++) rect(131 + i * 9, 28 + (i % 2) * 3, 7, 12 - (i % 2) * 3, [RED, BLUE, GREEN, ORANGE, PLUM, TEAL()][i]);
  rect(196, 84, 82, 5, BROWN); rect(196, 84, 82, 1, CLAY); rect(202, 89, 4, 12, DBROWN); rect(268, 89, 4, 12, DBROWN);
  ell(150, 112, 44, 6, DRED); ell(150, 112, 36, 4, RED);
}
const TEAL = () => DTEAL;
function roomFirst(t) {
  roomScene(t, false);
  const walk = seg(t, 7.8, 9.0), bx = lerp(100, 222, ss(walk)), moving = walk > 0 && walk < 1;
  const drop = seg(t, 9.0, 9.38);
  jar(240, 56 - 0, t >= 9.4 ? 1 / 22 : 0, t > 9.4 && t < 9.6 ? ((Math.floor(t * 24) % 2) ? 1 : -1) : 0);
  blit(boy(moving ? Math.floor(t * 8) & 3 : 1), bx, 90 - (moving ? 0 : 0));
  if (t >= 9.0 && t < 9.4) coin(bx + 18, 50 + drop * 22, Math.floor(t * 12) & 3);
  if (t > 4 && t < 5) { /* quiet start */ }
}
function roomLast(t) {
  roomScene(t, true);
  const fl = seg(t, 45.2, 45.5);
  jar(240, 56, t < 45.4 ? .93 : 1, t > 45.4 && t < 45.7 ? ((Math.floor(t * 24) % 2) ? 1 : -1) : 0);
  blit(boy(1), 205, 90);
  if (t >= 44.6 && t < 45.4) coin(205 + 18 + (240 + 8 - 223) * ss(seg(t, 44.6, 45.2)), 70 - Math.sin(Math.PI * seg(t, 44.6, 45.2)) * 16 + 12 * ss(seg(t, 45.2, 45.4)), Math.floor(t * 12) & 3);
}
function skyRamp(season) { return season === 'winter' ? [SLATE, GREY, SILVER] : season === 'autumn' ? [SKY, SILVER, CREAM] : [SKY, CYAN, CREAM]; }
function roadScene(t) {
  const u = t - 11.2, sea = seasonAt(t), sc = Math.floor(u * 60);
  vramp(0, 0, FW, 96, skyRamp(sea));
  if (sea === 'summer' || sea === 'spring') disc(40, 22, 9, YELLOWM);
  for (let k = 0; k < 4; k++) { const cx = ((k * 110 - sc * .15) % 460 + 460) % 460 - 70, cy = 18 + (k * 17) % 34; ell(cx, cy, 22, 6, WHITE); ell(cx - 12, cy + 2, 12, 5, WHITE); ell(cx + 14, cy + 2, 14, 5, WHITE); }
  for (let x = 0; x < FW; x++) { const h = 74 + Math.sin((x + sc * .22) / 34) * 7 + Math.sin((x + sc * .22) / 11) * 2; rect(x, h | 0, 1, 40, DTEAL); }
  const snow = sea === 'winter';
  for (let k = -1; k < 5; k++) {
    const bx = k * 96 - (sc * .5 % 96);
    // house
    rect(bx + 14, 80, 40, 24, CLAY); rect(bx + 14, 80, 40, 3, TAN); rect(bx + 10, 80, 48, 1, DRED);
    for (let j = 0; j < 9; j++) rect(bx + 14 - j, 80 - j, 40 + j * 2, 1, RUST);
    rect(bx + 30, 90, 10, 14, DBROWN); rect(bx + 18, 88, 8, 8, YELLOWM); rect(bx + 18, 88, 8, 8, sea === 'winter' ? YELLOWM : SKY); rect(bx + 21, 88, 1, 8, DBROWN);
    if (snow) { for (let j = 0; j < 9; j++) rect(bx + 14 - j, 80 - j, 40 + j * 2, 2, WHITE); }
    // tree
    const tx = bx + 72; rect(tx + 4, 88, 5, 16, BROWN); disc(tx + 6, 80, 11, GREEN); disc(tx + 1, 85, 7, DGREEN); disc(tx + 11, 85, 7, DGREEN); disc(tx + 6, 76, 7, GREEN);
    if (sea === 'spring') for (let i = 0; i < 9; i++) px(tx + (hash(k * 9 + i) * 20 | 0) - 3, 70 + (hash(k * 5 + i * 3) * 20 | 0), PINK);
    if (snow) { rect(tx - 2, 70, 18, 2, WHITE); }
  }
  rect(0, 100, FW, 8, GREEN); for (let x = 0; x < FW; x += 3) px(x, 100 + (x * 7 % 6), DGREEN);
  rect(0, 108, FW, 14, TAN); for (let x = 0; x < FW; x += 2) px((x + sc) % FW, 110 + (x * 5 % 11), CLAY); rect(0, 122, FW, 58, CLAY); for (let y = 122; y < 180; y += 3) for (let x = (y % 2) * 2; x < FW; x += 5) px((x + sc * (y > 150 ? 1.4 : 1)) % FW | 0, y, y > 150 ? BROWN : (hash(x + y) > .6 ? RUST : TAN));
  for (let i = 0; i < 9; i++) { const gx = ((i * 41 - sc * 1.4) % 370 + 370) % 370 - 20; rect(gx, 150 + (i * 13) % 24, 5, 3, DBROWN); rect(gx + 1, 149 + (i * 13) % 24, 3, 1, GREY); }
  if (snow) { for (let x = 0; x < FW; x++) if (bay(x, 100 + (x & 7)) < .8) rect(x, 100, 1, 8 - (x % 3), WHITE); rect(0, 108, FW, 14, SILVER); for (let x = 0; x < FW; x += 2) px((x + sc) % FW, 110 + (x * 5 % 11), WHITE); }
  // fence posts at full speed
  for (let k = -1; k < 6; k++) { const fx = k * 64 - (sc % 64); rect(fx, 98, 3, 12, BROWN); rect(fx - 64, 100, 64, 2, CLAY); }
  // the boy walks in place
  blit(boy(Math.floor(u * 8) & 3), 112, 91);
  // falling leaves / snow
  if (sea === 'autumn') for (let i = 0; i < 18; i++) { const x = (hash(i) * 340 - u * 40 - i * 7) % 340, y = ((u * 24 + hash(i + 9) * 120) % 130); px(((x % FW) + FW) % FW, y, [ORANGE, BORANGE, GOLDM, RUST][i % 4]); px(((x % FW) + FW) % FW + 1, y + 1, RUST); }
  if (snow) for (let i = 0; i < 40; i++) { const x = (hash(i + 3) * 340 - u * 12) % 340, y = ((u * 30 + hash(i + 31) * 130) % 132); px(((x % FW) + FW) % FW, y, WHITE); }
  // coins flying into the jar
  const n0 = Math.floor(u / .4);
  for (let n = n0 - 1; n <= n0; n++) { const p = (u - n * .4) / .5; if (p < 0 || p > 1 || n < 0) continue; const x = lerp(128, 300, ss(p)), y = lerp(100, 42, p) - Math.sin(Math.PI * p) * 34; coin(x | 0, y | 0, Math.floor(u * 12 + n) & 3); }
  hudDay(t); jarHud(t);
}
function hudDay(t) { win(4, 4, 84, 16); text('DAY ' + Math.max(1, Math.floor(dayAt(t))), 14, 8, WHITE); win(232, 4, 84, 16); text('G ' + goldAt(t), 242, 8, GOLD); }
function jarHud(t) { jar(290, 26, clamp(dayAt(t) / 365)); }
function battleScene(t) {
  const bt = t - 27.4;
  vramp(0, 0, FW, 100, [NIGHT, DUSK, SLATE]); stars(26, 8, 60);
  rect(0, 92, FW, 88, SLATE); for (let y = 0; y < 88; y += 6) rect(0, 92 + y, FW, 1, DUSK); for (let x = -80; x < 400; x += 44) line(160 + (x - 160) * .35, 92, x, 180, DUSK);
  ell(84, 98, 42, 6, DUSK); ell(236, 114, 26, 4, DUSK);
  // enemy
  let k = 1, show = true; if (t >= 35.3) { const u = seg(t, 35.3, 36.3); k = 1 - u; show = Math.floor(t * 12) % 2 === 0 && u < 1; }
  const bob = Math.round(Math.sin(t * (t > 31.9 && t < 33.8 ? 7 : 3)) * 1.5);
  if (show && k > .02) blitScaled(slime(Math.floor(t * 3) & 1), 84, 62 + bob + (1 - k) * 24, k * 1.7);
  // hero (back view), with the coin toss
  const shake = t > 34.5 && t < 35.0 ? 1 : 0;
  blit(boyBack(), 228 + shake, 90);
  if (t >= 34.6 && t < 35.4) { const p = seg(t, 34.6, 35.4); coin((236 - 150 * ss(p)) | 0, (88 - Math.sin(Math.PI * p) * 36 + p * 6) | 0, Math.floor(t * 14) & 3); }
  // windows
  const slide = ss(seg(t, 27.8, 28.4)), cslide = ss(seg(t, 31.0, 31.4));
  const sy = Math.round(lerp(60, 0, slide)), cy = Math.round(lerp(60, 0, cslide));
  win(4, 4, 312, 28);
  win(4, 122 + cy, 100, 54); win(108, 122 + sy, 208, 54);
  const items = ['ATTACK', 'SPEND', 'SAVE', 'RUN'];
  items.forEach((s, i) => text(s, 24, 130 + cy + i * 11, WHITE));
  if (t >= 31.2) {
    const cur = t < 31.9 ? 0 : t < 33.8 ? 1 : 2, hes = t >= 31.9 && t < 33.8;
    hand(8, 129 + cy + cur * 11, hes ? false : Math.floor(t * 4) % 2 === 0);
    if (t >= 34.5 && t < 35.2 && Math.floor(t * 12) % 2) text('SAVE', 24, 130 + cy + 22, GOLD);
  }
  text('BOY', 120, 130 + sy, WHITE); text('HP  30/30', 168, 130 + sy, WHITE);
  rect(120, 142 + sy, 188, 5, INK); rect(121, 143 + sy, 186, 3, GREEN);
  text('SAVINGS', 120, 152 + sy, WHITE); text('G ' + goldAt(t), 232, 152 + sy, GOLD);
  rect(120, 164 + sy, 188, 5, INK); rect(121, 165 + sy, Math.round(186 * (goldAt(t) / 365)), 3, GOLD);
  // messages in the top window
  const msgs = [...VOICE.filter(v => v.top), ...MSGS];
  for (const m of msgs) if (t >= m.t && t < m.t + hold(m)) { const sh = Math.floor((t - m.t) * 38); const L = wrap(m.text, 36); let left = sh; L.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length; text(part, 14, 9 + i * 11, WHITE); }); }
  // level up
  if (t >= 38 && t < 40.8) { const u = ss(seg(t, 38, 38.25)); win(70, 38, 180, 52); text('LEVEL UP!', 160 - 36, 48, Math.floor(t * 8) % 2 ? GOLD : YELLOWM); text('PATIENCE 4 > 5', 160 - 56, 68, WHITE); }
}
function shopScene(t) {
  rect(0, 0, FW, 100, TAN); rect(0, 0, FW, 8, BROWN); for (let x = 0; x < FW; x += 16) rect(x, 8, 8, 6, x % 32 ? RED : WHITE);
  rect(0, 100, FW, 80, BROWN); for (let x = 0; x < FW; x += 26) rect(x, 100, 1, 80, DBROWN); for (let y = 100; y < 180; y += 20) rect(0, y, FW, 1, DBROWN); rect(0, 98, FW, 2, DBROWN); rect(60, 128, 60, 24, DRED); rect(62, 130, 56, 20, RED);
  // shelves
  for (const y of [38, 66]) rect(20, y + 12, 280, 3, DBROWN);
  // items: cake, robot, candy jar
  rect(34, 52, 22, 10, PINK); rect(34, 52, 22, 3, WHITE); disc(45, 49, 2, RED); rect(34, 58, 22, 4, MAGENTA);
  rect(80, 44, 14, 18, GREY); rect(82, 38, 10, 7, SILVER); px(84, 41, RED); px(89, 41, RED); rect(76, 48, 3, 10, GREY); rect(95, 48, 3, 10, GREY);
  rect(130, 46, 16, 16, SILVER); rect(132, 44, 12, 3, BROWN); for (let i = 0; i < 9; i++) px(133 + (i * 5) % 11, 50 + (i * 3) % 10, [RED, YELLOWM, GREEN, PINK][i % 4]);
  rect(34, 80, 22, 12, BLUE); rect(34, 78, 22, 3, SKY); rect(80, 82, 14, 10, ORANGE); rect(130, 80, 16, 12, DGREEN);
  // the red kite on the wall (only while it is not yet bought)
  if (t < 53.2) { blit(kiteSpr(), 232, 30); for (let i = 0; i < 8; i++) px(243 + Math.round(Math.sin(i * .9 + t * 4) * 2), 58 + i * 3, [YELLOWM, SKY, GREEN][i % 3]); text('365G', 236, 92, GOLD); }
  // counter + shopkeeper
  blit(shopkeeper(), 190, 66 + Math.round(Math.sin(t * 2) * .5));
  rect(150, 94, 150, 26, BROWN); rect(150, 94, 150, 3, CLAY); rect(150, 117, 150, 3, DBROWN);
  blit(boy(1), 96, 90);
  hudShop(t);
  if (t >= 51.8 && t < 53.2) for (let i = 0; i < 4; i++) { const p = ((t - 51.8) * 8 + i * .25) % 1; coin((290 - 110 * p) | 0, (30 + 60 * p - Math.sin(Math.PI * p) * 24) | 0, i + Math.floor(t * 12)); }
  if (t >= 53.3 && t < 55.6) { win(78, 40, 164, 52); text('GOT RED KITE!', 160 - 52, 52, Math.floor(t * 6) % 2 ? GOLD : YELLOWM); blit(kiteSpr(), 148, 62 + Math.round(Math.sin(t * 5) * 1)); }
  if (t >= 49.4 && t < 51.9) { win(236, 126, 76, 34); text('YES', 266, 132, WHITE); text('NO', 266, 146, WHITE); hand(246, 131 + (t > 50.9 ? 0 : 0), Math.floor(t * 4) % 2 === 0); }
}
function hudShop(t) { win(232, 4, 84, 16); text('G ' + goldAt(t), 242, 8, GOLD); }
function hillScene(t) {
  const u = t - 55.6;
  vramp(0, 0, FW, 120, [SKY, CYAN, CREAM]);
  disc(268, 24, 10, YELLOWM);
  for (let k = 0; k < 3; k++) { const cx = ((k * 140 - u * 5) % 440 + 440) % 440 - 60, cy = 20 + k * 22; ell(cx, cy, 24, 6, WHITE); ell(cx - 12, cy + 2, 14, 5, WHITE); ell(cx + 14, cy + 2, 16, 5, WHITE); }
  for (let x = 0; x < FW; x++) { const h = 100 + Math.sin(x / 40) * 4 - 22 * Math.exp(-((x - 130) ** 2) / 5000); rect(x, h | 0, 1, 90, GREEN); }
  for (let x = 0; x < FW; x++) { const h = 112 + Math.sin(x / 30 + 1) * 3; rect(x, h | 0, 1, 70, DGREEN); }
  for (let x = 0; x < FW; x += 3) px(x, 108 + (x * 7 % 9), YELLOWM);
  blit(boyBack(), 122, 78);
  const ky = 36 + Math.sin(u * 1.6) * 3, kx = 214 + Math.sin(u * 1.1) * 8;
  line(131, 90, kx + 11, ky + 24, WHITE); blit(kiteSpr(), kx, ky);
  for (let i = 0; i < 9; i++) px(kx + 11 + Math.round(Math.sin(i * .8 + u * 5) * 3), ky + 26 + i * 3, [YELLOWM, SKY, GREEN][i % 3]);
  if (t >= 57.5 && t < 60) { win(86, 54, 148, 54); text('SAVE COMPLETE', 160 - 52, 64, WHITE); text('FILE 1  DAY 366', 160 - 60, 84, GOLD); }
}
function dialogOverlay(t) {
  const all = [...VOICE.filter(v => !v.top), ...SHOP];
  for (const v of all) {
    if (t < v.t || t >= v.t + hold(v)) continue;
    if (sceneAt(t) === 'black' || sceneAt(t) === 'title') continue;
    win(4, 122, 312, 54); portrait(v.who === 'shop' ? 'shop' : 'boy', v.id === 'v4' ? 'determined' : v.id === 'v7' || v.id === 'v6' ? 'smile' : 'neutral', 10, 132);
    const sh = Math.floor((t - v.t) * 38); const L = wrap(v.text, 31); let left = sh;
    L.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length; text(part, 48, 132 + i * 12, WHITE); });
    if (sh >= v.text.length && Math.floor(t * 3) % 2 === 0) { rect(298, 166, 5, 1, WHITE); rect(299, 167, 3, 1, WHITE); px(300, 168, WHITE); }
  }
}

/* ========================================================================= transitions + present */
function mosaic(b) { if (b <= 1) return; const o = fb.slice(); for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) fb[y * FW + x] = o[(Math.floor(y / b) * b) * FW + Math.floor(x / b) * b]; }
function swirl(u) { // polar twist + mosaic + Bayer dissolve to white
  const o = fb.slice(), cx = FW / 2, cy = FH / 2;
  const tw = (u < .5 ? u : 1 - u) * 2; // 0..1..0 about the swap at the middle
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + tw * 7 * (1 - Math.min(1, r / 190));
    const sx = Math.round(cx + Math.cos(a) * r), sy = Math.round(cy + Math.sin(a) * r);
    let c = (sx >= 0 && sy >= 0 && sx < FW && sy < FH) ? o[sy * FW + sx] : INK;
    if (bay(x, y) < ss(clamp(tw * 1.3 - .15)) * .88) c = WHITE; fb[y * FW + x] = c;
  }
  mosaic([1, 2, 3, 4, 6, 8][Math.floor(tw * 5.99)]);
}
function lutFor(t) {
  const S = LUTS; let A, B, k = 0;
  const pairs = [[15, 'spring', 'summer'], [18.8, 'summer', 'autumn'], [22.6, 'autumn', 'winter']];
  let cur = t < 15 ? 'spring' : t < 18.8 ? 'summer' : t < 22.6 ? 'autumn' : 'winter';
  if (t < 3.7) cur = 'summer';
  if (t > 41.4 && t < 45.2) cur = 'winter'; if (t >= 45.2) cur = 'summer';
  A = S[cur]; B = A;
  if (t > 3.7 && t < 11) { A = S.spring; }
  for (const [tb, a, b] of pairs) if (Math.abs(t - tb) < .3) { A = S[a]; B = S[b]; k = q4(seg(t, tb - .3, tb + .3)); return lutMix(A, B, k); }
  return A;
}
function fadeK(t) { if (t > 40.8 && t < 41.4) return q4(seg(t, 40.8, 41.4)); if (t >= 41.4 && t < 42) return 1; if (t >= 42 && t < 42.5) return 1 - q4(seg(t, 42, 42.5)); if (t > 59.4) return q4(seg(t, 59.4, 60)); return 0; }
function present(t) {
  let lut = lutFor(t); const fk = fadeK(t); if (fk > 0) lut = lutMix(lut, BLACKL, fk);
  const flood = t >= 45.2 && t < 46.7 ? seg(t, 45.2, 46.6) : -1; const winL = LUTS.winter, sumL = LUTS.summer;
  const img = octx.createImageData(FW, FH), d = img.data;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x; let L = lut; if (flood >= 0) L = (x / FW * .85 + (bay(x, y) - .5) * .3 < flood * 1.15 - .1) ? sumL : winL;
    const c = L[fb[i]] || L[INK]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, FW * 6, FH * 6);
}
function render(t) {
  TIME = t; T = { d: fb, w: FW, h: FH, ox: 0, oy: 0 }; fb.fill(INK);
  const s = sceneAt(t);
  if (s === 'title') titleScene(t); else if (s === 'room') { roomFirst(t); if (t >= 9.4 && t < 10.6) { hudDay(t); } } else if (s === 'road') roadScene(t);
  else if (s === 'battle') battleScene(t); else if (s === 'room2') roomLast(t); else if (s === 'shop') shopScene(t); else if (s === 'hill') hillScene(t);
  dialogOverlay(t);
  // transitions
  if (t >= 3.4 && t < 4.0) mosaic([1, 2, 4, 8, 16, 8, 4, 2, 1][Math.min(8, Math.floor(seg(t, 3.4, 4.0) * 9))] || 1);
  if (t >= 10.6 && t < 11.2) mosaic([1, 2, 4, 8, 16, 8, 4, 2, 1][Math.min(8, Math.floor(seg(t, 10.6, 11.2) * 9))] || 1);
  if (t >= 26.2 && t < 27.4) swirl(seg(t, 26.2, 27.4));
  if (t >= 45.0 && t < 45.9 || t >= 34.5 && t < 35.1) { /* shake handled below */ }
  present(t);
}
window.render = render;
window.TEXTS = t => { const o = []; if (t > 0.1 && t < 3.4) o.push({ id: 'title', text: 'A COIN A DAY', x0: 384, y0: 276, x1: 1152, y1: 372 }); if (t >= 38.3 && t < 40.8) { o.push({ id: 'lv', text: 'LEVEL UP!', x0: 600, y0: 288, x1: 1320, y1: 348 }); o.push({ id: 'pat', text: 'PATIENCE 4 > 5', x0: 600, y0: 408, x1: 1320, y1: 468 }); } if (t >= 53.3 && t < 55.6) o.push({ id: 'kite', text: 'GOT RED KITE!', x0: 640, y0: 312, x1: 1280, y1: 372 }); if (t >= 57.6 && t < 60) { o.push({ id: 'save', text: 'SAVE COMPLETE', x0: 640, y0: 384, x1: 1280, y1: 444 }); o.push({ id: 'file', text: 'FILE 1  DAY 366', x0: 600, y0: 504, x1: 1320, y1: 564 }); } return o; };

/* ========================================================================= cues for the mixer */
function buildEV() {
  const ev = [];
  VOICE.forEach(v => ev.push({ t: v.t, type: 'voice', id: v.id }));
  [...VOICE, ...SHOP, ...MSGS].forEach(v => ev.push({ t: v.t, type: 'type', n: v.text.length, cps: 38, who: v.who || 'sys', voiced: !!VOICE.find(x => x.id === v.id) }));
  for (let t = .5; t < 3.4; t += .25) ev.push({ t: +t.toFixed(2), type: 'step', g: .5 });
  for (let t = 7.8; t < 9.0; t += .25) ev.push({ t: +t.toFixed(2), type: 'step', g: .7 });
  for (let t = 11.3; t < 26.2; t += .25) ev.push({ t: +t.toFixed(2), type: 'step', g: .55 });
  for (let n = 0; n < 38; n++) ev.push({ t: +(11.2 + n * .4 + .5).toFixed(2), type: 'coin', day: n });
  ev.push({ t: 9.4, type: 'drop' }, { t: 45.4, type: 'drop2' }, { t: 3.4, type: 'mosaic' }, { t: 10.6, type: 'mosaic' }, { t: 26.2, type: 'swirl' });
  ev.push({ t: 15, type: 'season', k: 1 }, { t: 18.8, type: 'season', k: 2 }, { t: 22.6, type: 'season', k: 3 });
  ev.push({ t: 31.2, type: 'cursor' }, { t: 31.9, type: 'cursor' }, { t: 33.8, type: 'cursor' }, { t: 34.5, type: 'select' }, { t: 34.6, type: 'toss' }, { t: 35.3, type: 'ko' }, { t: 38.0, type: 'levelup' });
  ev.push({ t: 45.2, type: 'flood' }, { t: 46.6, type: 'bell' }, { t: 51.0, type: 'select' }, { t: 53.4, type: 'itemget' });
  for (let t = 51.8; t < 53.2; t += .06) ev.push({ t: +t.toFixed(2), type: 'tick' });
  for (let i = 0; i < 6; i++) ev.push({ t: +(58.3 + i * .28).toFixed(2), type: 'savetick' });
  ev.push({ t: 0.2, type: 'startjingle' });
  return ev.sort((a, b) => a.t - b.t);
}
async function init() {
  await document.fonts.load('8px PS2P'); await document.fonts.load('16px PS2P');
  window.EV = buildEV(); window.READY = true;
}
init();
