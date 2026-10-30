const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DASH = "—";
const MINUS = "−";

const abs0 = (n: number): string =>
  Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function usd0(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  return (n < 0 ? MINUS : "") + "$" + abs0(n);
}

export function usd2(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  return (
    (n < 0 ? MINUS : "") +
    "$" +
    Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function sgn0(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  return (n >= 0 ? "+" : MINUS) + "$" + abs0(n);
}

export function pct(n: number, d = 1): string {
  if (!Number.isFinite(n)) return DASH;
  return (n >= 0 ? "+" : MINUS) + Math.abs(n * 100).toFixed(d) + "%";
}

function parseIso(iso: string): number {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== iso) return NaN;
  return t;
}

export function fd(isoDate: string): string {
  const t = parseIso(isoDate);
  if (Number.isNaN(t)) return DASH;
  const x = new Date(t);
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
}

/** Whole UTC days from -> to; NaN only when either date is invalid. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / 864e5);
}
