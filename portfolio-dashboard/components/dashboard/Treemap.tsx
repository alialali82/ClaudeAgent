"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dashboard, DashboardPosition } from "@/lib/dashboard/build";
import { pct, usd0 } from "@/lib/format";
import { squarify } from "@/lib/dashboard/squarify";
import { openHolding } from "./openHolding";

type Bin = "tc" | "tn" | "t0" | "t1" | "t2" | "t3" | "t4";

/** Colour bin from the price against the Street low, then upside to the blended average. */
export function tileBin(p: DashboardPosition): Bin {
  const sp = p.market.sp;
  if (sp && p.market.price < sp.low) return "tc";
  const up = p.view.up;
  if (up === null || !Number.isFinite(up)) return "tn";
  return up < 0 ? "t0" : up < 0.1 ? "t1" : up < 0.3 ? "t2" : up < 0.5 ? "t3" : "t4";
}

const DEFAULT_SIZE = { w: 1000, h: 460 };
const DEBOUNCE_MS = 150;

const LEGEND: [Bin | "lowc", string][] = [
  ["tc", "Below lowest target"],
  ["t0", "Above average"],
  ["t1", "0–10% to average"],
  ["t2", "10–30%"],
  ["t3", "30–50%"],
  ["t4", "50%+"],
];

export function Treemap({ dashboard }: { dashboard: Dashboard }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      if (first) {
        first = false;
        measure();
      } else timer = setTimeout(measure, DEBOUNCE_MS);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  const tiles = useMemo(
    () =>
      squarify(
        dashboard.positions.map((p) => ({ p, value: p.value })),
        0,
        0,
        size.w,
        size.h,
      ),
    [dashboard.positions, size],
  );
  const anyNoTarget = dashboard.positions.some((p) => tileBin(p) === "tn");

  return (
    <div className="mapwrap">
      <div className="map" ref={ref}>
        {tiles.map(({ item: { p }, x, y, w, h }) => {
          const area = w * h;
          const sz = area < 3200 || w < 58 ? "xs" : area < 9000 || h < 52 ? "s" : "";
          const bin = tileBin(p);
          const weight = `${(p.w * 100).toFixed(1)}%`;
          const up = p.view.up;
          const street = up === null || !Number.isFinite(up) ? null : up;
          return (
            <button
              key={p.ticker}
              type="button"
              className={["tile", sz, bin, p.view.lowc ? "lowc" : ""].filter(Boolean).join(" ")}
              style={{
                left: `${(x / size.w) * 100}%`,
                top: `${(y / size.h) * 100}%`,
                width: `${(w / size.w) * 100}%`,
                height: `${(h / size.h) * 100}%`,
              }}
              aria-label={`${p.name}, ${weight} of portfolio, ${
                street === null ? "no Street target" : `Street average ${pct(street)}`
              }`}
              title={`${p.name} · ${usd0(p.value)}`}
              onClick={() => openHolding(p.ticker)}
            >
              <span className="tk">{p.ticker}</span>
              <span className="sub">
                {weight} · {usd0(p.value)}
                <br />
                {street === null ? "no target" : `Street ${pct(street, 0)}`}
              </span>
            </button>
          );
        })}
      </div>
      <div className="maplegend">
        {LEGEND.map(([c, label]) => (
          <span key={c}>
            <i className={c} />
            {label}
          </span>
        ))}
        <span>
          <i className="lowc" />
          Low-confidence target
        </span>
        {anyNoTarget && (
          <span>
            <i className="tn" />
            No Street target
          </span>
        )}
      </div>
    </div>
  );
}
