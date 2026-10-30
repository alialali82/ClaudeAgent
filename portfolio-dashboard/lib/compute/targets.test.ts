import { describe, expect, it } from "vitest";
import { blendTargets, deriveTarget, targetStatus } from "./targets";
import { loadReferenceMarket } from "@/lib/testing/fromReference";
import type { TickerMarket } from "@/lib/types";

const { asof, market } = loadReferenceMarket();

function synth(over: Partial<TickerMarket> = {}): TickerMarket {
  return {
    ticker: "SYN",
    name: "Synthetic",
    price: 100,
    prevClose: 100,
    beta: 1,
    sp: { avg: 120, low: 90, high: 150, n: 30 },
    zacks: null,
    calls: [],
    tgtDate: asof,
    closes: [],
    errors: {},
    ...over,
  };
}

function daysBefore(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
}

describe("blendTargets", () => {
  it("blends NVDA to 325.97", () => {
    const m = market.NVDA;
    const b = blendTargets(m.calls, asof, m.sp!.avg, m.zacks!.avg);
    expect(b.cons).toBeCloseTo(325.97, 2);
    expect(b.nc).toBe(9);
    expect(b.np).toBe(3);
    expect(b.rc).toBe(325);
  });

  it("ignores calls older than 60 days", () => {
    const calls: [string, number, string][] = [
      ["A", 100, daysBefore(asof, 61)],
      ["B", 200, daysBefore(asof, 62)],
      ["C", 300, daysBefore(asof, 90)],
    ];
    const b = blendTargets(calls, asof, 150, 170);
    expect(b.nc).toBe(0);
    expect(b.rc).toBeNull();
    expect(b.cons).toBe(160);
  });

  it("uses only sp and zacks when fewer than 3 recent calls", () => {
    const calls: [string, number, string][] = [
      ["A", 500, asof],
      ["B", 600, daysBefore(asof, 5)],
    ];
    const b = blendTargets(calls, asof, 100, 120);
    expect(b.nc).toBe(2);
    expect(b.np).toBe(2);
    expect(b.rc).toBeNull();
    expect(b.cons).toBe(110);
    expect(b.callLo).toBe(500);
    expect(b.callHi).toBe(600);
  });

  it("returns null cons without NaN when nothing is available", () => {
    const b = blendTargets([], asof, null, null);
    expect(b.cons).toBeNull();
    expect(b.np).toBe(0);
  });
});

describe("deriveTarget", () => {
  it("haircuts NVDA to 303.82", () => {
    const v = deriveTarget(market.NVDA, asof);
    expect(v.k).toBe(0.75);
    expect(v.hc).toBeCloseTo(303.82, 2);
    expect(v.covered).toBe(true);
  });

  it("blends ADBE to 265.40 with haircut 257.23 and ab 0.5712", () => {
    const v = deriveTarget(market.ADBE, asof);
    expect(v.cons).toBeCloseTo(265.4, 2);
    expect(v.hc).toBeCloseTo(257.23, 2);
    expect(v.ab).toBeCloseTo(0.5712, 4);
  });

  it("haircut equals the average when average is below price", () => {
    const v = deriveTarget(synth({ price: 200, sp: { avg: 150, low: 100, high: 250, n: 30 } }), asof);
    expect(v.hc).toBe(150);
  });

  it("flags MRAM low confidence (n = 3)", () => {
    expect(deriveTarget(market.MRAM, asof).lowc).toBe(true);
    expect(deriveTarget(market.MRAM, asof).k).toBe(0.4);
  });

  it("does not flag ADBE", () => {
    expect(deriveTarget(market.ADBE, asof).lowc).toBe(false);
  });

  it("flags a target 31 days old", () => {
    const v = deriveTarget(synth({ tgtDate: daysBefore(asof, 31) }), asof);
    expect(v.age).toBe(31);
    expect(v.lowc).toBe(true);
    expect(deriveTarget(synth({ tgtDate: daysBefore(asof, 30) }), asof).lowc).toBe(false);
  });

  it("flags sources 16% apart", () => {
    const v = deriveTarget(
      synth({ sp: { avg: 116, low: 90, high: 150, n: 30 }, zacks: { avg: 100, low: 90, high: 150 } }),
      asof,
    );
    expect(v.spread).toBeCloseTo(0.16, 5);
    expect(v.lowc).toBe(true);
  });

  it("returns covered:false and null targets when sp and zacks are both null, without NaN", () => {
    const v = deriveTarget(synth({ sp: null, zacks: null }), asof);
    expect(v.covered).toBe(false);
    expect(v.cons).toBeNull();
    expect(v.hc).toBeNull();
    expect(v.up).toBeNull();
    expect(v.upH).toBeNull();
    expect(v.upL).toBeNull();
    expect(v.upB).toBeNull();
    expect(v.spread).toBe(0);
    expect(v.lowc).toBe(true);
    expect(Object.values(v).some((x) => typeof x === "number" && Number.isNaN(x))).toBe(false);
  });

  it("adjusts beta: null beta gives ab = 1", () => {
    expect(deriveTarget(synth({ beta: null }), asof).ab).toBe(1);
  });
});

describe("targetStatus", () => {
  const v = deriveTarget(synth(), asof); // up = 0.2
  it("classifies", () => {
    expect(targetStatus(160, v, 90, 150)).toEqual({ label: "▲ Above Street high", tone: "hot" });
    expect(targetStatus(80, v, 90, 150)).toEqual({ label: "▼ Below Street low", tone: "cold" });
    expect(targetStatus(100, v, 90, 150).label).toBe("Room to average");
    expect(targetStatus(115, deriveTarget(synth({ price: 115 }), asof), 90, 150).label).toBe("Near average");
    expect(targetStatus(100, deriveTarget(synth({ price: 50 }), asof), 40, 150).label).toBe("Wide gap to average");
    expect(targetStatus(130, deriveTarget(synth({ price: 130 }), asof), 90, 150)).toEqual({
      label: "Above Street average",
      tone: "hot",
    });
  });
  it("handles no target", () => {
    const n = deriveTarget(synth({ sp: null }), asof);
    expect(targetStatus(100, n, 0, 0)).toEqual({ label: "No Street target", tone: "" });
  });
});
