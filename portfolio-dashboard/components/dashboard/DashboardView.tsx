import type { Dashboard } from "@/lib/dashboard/build";
import { usd0 } from "@/lib/format";

/** Stub: Task 14 replaces this with the real dashboard. */
export function DashboardView({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="stack">
      <p>
        Dashboard ready: {usd0(dashboard.total)} across {dashboard.positions.length} positions
      </p>
      {dashboard.failures.length > 0 && (
        <div className="notice">
          <p>Could not price:</p>
          <ul>
            {dashboard.failures.map((f) => (
              <li key={f.ticker}>
                {f.ticker} ({f.code})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
