export type Rect<T> = { item: T; x: number; y: number; w: number; h: number };

/**
 * Squarified treemap (Bruls et al.). Values are scaled so the tiles cover the
 * container exactly. Non-finite and non-positive values are dropped; equal
 * values keep their input order, so the layout is deterministic.
 */
export function squarify<T extends { value: number }>(
  nodes: T[],
  x: number,
  y: number,
  w: number,
  h: number,
): Rect<T>[] {
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return [];
  const valid = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => Number.isFinite(n.value) && n.value > 0)
    .sort((a, b) => b.n.value - a.n.value || a.i - b.i)
    .map(({ n }) => n);
  const total = valid.reduce((s, n) => s + n.value, 0);
  if (!valid.length || !(total > 0)) return [];

  const scale = (w * h) / total;
  const items = valid.map((item) => ({ item, a: item.value * scale }));
  const out: Rect<T>[] = [];
  let row: typeof items = [];
  let i = 0;
  const sumA = (r: typeof items) => r.reduce((s, n) => s + n.a, 0);
  const worst = (r: typeof items, s: number) => {
    const S = sumA(r);
    const mx = Math.max(...r.map((n) => n.a));
    const mn = Math.min(...r.map((n) => n.a));
    return Math.max((s * s * mx) / (S * S), (S * S) / (s * s * mn));
  };
  const place = (r: typeof items) => {
    const S = sumA(r);
    if (w >= h) {
      const cw = S / h;
      let cy = y;
      for (const n of r) {
        const nh = n.a / cw;
        out.push({ item: n.item, x, y: cy, w: cw, h: nh });
        cy += nh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = S / w;
      let cx = x;
      for (const n of r) {
        const nw = n.a / rh;
        out.push({ item: n.item, x: cx, y, w: nw, h: rh });
        cx += nw;
      }
      y += rh;
      h -= rh;
    }
  };
  while (i < items.length) {
    const s = Math.min(w, h);
    const n = items[i];
    if (!row.length || worst([...row, n], s) <= worst(row, s)) {
      row.push(n);
      i++;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}
