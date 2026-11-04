"use client";

import type { Dashboard } from "@/lib/dashboard/build";
import "@/styles/dashboard.css";

const REASONS: Record<string, string> = {
  unknown: "ticker not found",
  no_price: "no price available",
  deadline: "timed out",
  failed: "lookup failed",
};
const reason = (code: string): string => REASONS[code] ?? "lookup failed";

const SOURCES: Record<string, string> = {
  stockanalysis: "Street targets",
  nasdaq_targets: "Zacks target",
  nasdaq_earnings: "results dates",
  nasdaq_profile: "sector",
  beta: "beta",
  yahoo: "prices",
};
const source = (key: string): string => SOURCES[key] ?? key.replace(/_/g, " ");

function Status({ d }: { d: Dashboard }) {
  const failed = new Set(d.failures.map((f) => f.ticker));
  const excluded = d.unpriced.filter((t) => !failed.has(t));
  if (!d.failures.length && !excluded.length && !d.sourceNotes.length) return null;
  return (
    <div className="status" role="status">
      {d.failures.length > 0 && (
        <p className="banner err">
          Couldn&apos;t load market data for:{" "}
          {d.failures.map((f) => `${f.ticker} (${reason(f.code)})`).join(", ")}
        </p>
      )}
      {excluded.length > 0 && (
        <p className="banner">Excluded from totals (no price): {excluded.join(", ")}</p>
      )}
      {d.sourceNotes.length > 0 && (
        <details className="banner">
          <summary>
            Some data was unavailable for {d.sourceNotes.length}{" "}
            {d.sourceNotes.length === 1 ? "holding" : "holdings"}
          </summary>
          <ul>
            {d.sourceNotes.map((n) => (
              <li key={n.ticker}>
                {n.ticker}: {n.missing.map(source).join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function DashboardView({ dashboard }: { dashboard: Dashboard }) {
  if (!dashboard.positions.length) {
    return (
      <div className="wrap dash">
        <Status d={dashboard} />
        <div className="empty">
          <h2>No holdings could be priced</h2>
          <p>
            Nothing here has a usable price, so there is nothing to draw. Use Start over to go back and check the
            tickers.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="wrap dash">
      <Status d={dashboard} />
      {/*
        14a sections are added below as they land: Hero, The map (+ Attention), Since.
        14b: Performance, Risk, Holdings.
        14c: Results & events (Calendar), Earnings season (Season), 12 months out (Outlook), Method.
      */}
    </div>
  );
}
