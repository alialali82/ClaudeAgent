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

export function fd(isoDate: string): string {
  const x = new Date(`${isoDate}T00:00:00Z`);
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 864e5,
  );
}
