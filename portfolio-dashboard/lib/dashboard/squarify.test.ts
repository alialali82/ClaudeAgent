import { describe, expect, it } from "vitest";
import { squarify } from "./squarify";

const items = (...vs: number[]) => vs.map((value, i) => ({ id: `n${i}`, value }));
const area = (r: { w: number; h: number }) => r.w * r.h;

describe("squarify", () => {
  it("covers the container area exactly", () => {
    const out = squarify(items(50, 30, 10, 5, 3, 2), 0, 0, 1000, 460);
    expect(out.reduce((s, r) => s + area(r), 0)).toBeCloseTo(1000 * 460, 6);
  });

  it("keeps every tile inside the container and never overlaps", () => {
    const out = squarify(items(40, 25, 15, 10, 6, 4), 10, 20, 640, 360);
    for (const r of out) {
      expect(r.x).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(r.y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(650 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(380 + 1e-6);
    }
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(ox > 1e-6 && oy > 1e-6).toBe(false);
      }
  });

  it("gives each tile an area proportional to its value, ordered by value", () => {
    const out = squarify(items(5, 50, 20), 0, 0, 300, 200);
    expect(out.map((r) => r.item.id)).toEqual(["n1", "n2", "n0"]);
    const total = 75;
    for (const r of out) expect(area(r)).toBeCloseTo((r.item.value / total) * 300 * 200, 6);
  });

  it("fills the container with a single node", () => {
    const out = squarify(items(7), 0, 0, 320, 180);
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(0);
    expect(out[0].y).toBe(0);
    expect(out[0].w).toBeCloseTo(320, 6);
    expect(out[0].h).toBeCloseTo(180, 6);
  });

  it("drops zero, negative, NaN and infinite values", () => {
    const out = squarify(items(10, 0, -3, NaN, Infinity, 5), 0, 0, 100, 100);
    expect(out.map((r) => r.item.id)).toEqual(["n0", "n5"]);
    expect(out.reduce((s, r) => s + area(r), 0)).toBeCloseTo(10000, 6);
  });

  it("returns nothing for an empty list or a degenerate container", () => {
    expect(squarify([], 0, 0, 100, 100)).toEqual([]);
    expect(squarify(items(1, 2), 0, 0, 0, 100)).toEqual([]);
    expect(squarify(items(1, 2), 0, 0, 100, NaN)).toEqual([]);
    expect(squarify(items(0, 0), 0, 0, 100, 100)).toEqual([]);
  });

  it("is deterministic and stable for equal values", () => {
    const a = squarify(items(5, 5, 5, 5), 0, 0, 200, 100);
    const b = squarify(items(5, 5, 5, 5), 0, 0, 200, 100);
    expect(a).toEqual(b);
    expect(a.map((r) => r.item.id)).toEqual(["n0", "n1", "n2", "n3"]);
  });

  it("handles 100 nodes with total coverage and finite geometry", () => {
    const vs = Array.from({ length: 100 }, (_, i) => 100 - i * 0.9);
    const out = squarify(items(...vs), 0, 0, 1000, 460);
    expect(out).toHaveLength(100);
    expect(out.reduce((s, r) => s + area(r), 0)).toBeCloseTo(460000, 4);
    for (const r of out) for (const n of [r.x, r.y, r.w, r.h]) expect(Number.isFinite(n)).toBe(true);
  });
});
