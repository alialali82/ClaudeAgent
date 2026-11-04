const DAY = 864e5;
const parse = (iso: string): number =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T00:00:00Z`) : NaN;

/**
 * Weekdays strictly between the price date and the viewer's date: the number of
 * closes that should exist but are not in the data. Today itself is excluded
 * because its close is not published yet. Holidays are not modelled.
 */
export function tradingDaysBehind(asof: string, todayIso: string): number {
  const from = parse(asof);
  const to = parse(todayIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  let n = 0;
  for (let t = from + DAY; t < to; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd > 0 && wd < 6) n++;
  }
  return n;
}

/** The viewer's calendar date as ISO, from the device clock. */
export function deviceToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
