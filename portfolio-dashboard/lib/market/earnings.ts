// Pure earnings helpers built on api.nasdaq.com (Zacks) responses.
// Findings recorded 2026-11-04 (see __fixtures__/ and docs/superpowers/notes/data-sources.md):
//  - earnings-date has NO structured date and NO confirmed flag. `data.reportText` is prose:
//    "<Co> is expected* to report earnings on  11/17/2026 after market close.  The report will be for the
//    fiscal Quarter ending Oct 2026. ..." and `data.announcement` is "Earnings announcement* for NVDA: Nov 17, 2026".
//    The asterisk marks an estimate, so `conf` is false unless the text says "confirmed" (never observed).
//    The fiscal quarter is a month/year, not Q1..Q4, so `what` reads "Oct 2026 quarter results".
//    When the vendor has no date the prose says so and `announcement` ends with an empty value.
//  - earnings-surprise: data.earningsSurpriseTable.rows[] {fiscalQtrEnd, dateReported "M/D/YYYY", eps,
//    consensusForecast, percentageSurprise (string)}, 4 rows, newest first.
import { isIsoDate, isRecord, parseMoney, toIso } from "./util";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function usDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  return m ? toIso(Number(m[3]), Number(m[1]), Number(m[2])) : null;
}

export function parseNasdaqEarningsDate(
  json: unknown,
  today: string,
): { date: string; what: string; conf: boolean } | null {
  try {
    if (!isIsoDate(today) || !isRecord(json) || !isRecord(json.data)) return null;
    const text = typeof json.data.reportText === "string" ? json.data.reportText : "";
    const ann = typeof json.data.announcement === "string" ? json.data.announcement : "";

    let date: string | null = null;
    const a = /report(?:s)?\s+earnings\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text);
    if (a) date = usDate(a[1]);
    if (!date) {
      const b = /\b([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})\s*$/.exec(ann.trim());
      const mon = b ? MONTHS.indexOf(b[1].toLowerCase()) + 1 : 0;
      if (b && mon > 0) date = toIso(Number(b[3]), mon, Number(b[2]));
    }
    if (!date || date < today) return null;

    const q = /Quarter ending\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i.exec(text);
    const what = q ? `${q[1][0].toUpperCase()}${q[1].slice(1).toLowerCase()} ${q[2]} quarter results` : "Results";
    return { date, what, conf: /\bconfirmed\b/i.test(text) };
  } catch {
    return null;
  }
}

export function parseNasdaqEarningsSurprise(json: unknown): { date: string; surprisePct: number | null }[] {
  try {
    if (!isRecord(json) || !isRecord(json.data) || !isRecord(json.data.earningsSurpriseTable)) return [];
    const rows = json.data.earningsSurpriseTable.rows;
    if (!Array.isArray(rows)) return [];
    const out: { date: string; surprisePct: number | null }[] = [];
    for (const r of rows) {
      if (!isRecord(r) || typeof r.dateReported !== "string") continue;
      const date = usDate(r.dateReported);
      if (!date) continue;
      const raw = typeof r.percentageSurprise === "string" ? r.percentageSurprise.replace(/%$/, "") : r.percentageSurprise;
      out.push({ date, surprisePct: parseMoney(raw) });
    }
    return out
      .map((x, i) => ({ x, i }))
      .sort((p, q) => (p.x.date < q.x.date ? 1 : p.x.date > q.x.date ? -1 : p.i - q.i))
      .slice(0, 4)
      .map((e) => e.x);
  } catch {
    return [];
  }
}

/**
 * Price reaction per report, in percent (2 decimals), same unit as surprisePct.
 * movePct = close on the first trading day AFTER the report date / close on the last trading day BEFORE
 * the report date, minus 1. This two-day window captures the reaction for both before-open reports
 * (move happens on the report date) and after-close reports (move happens the next day), at the cost
 * of including one extra quiet day. null when closes are missing on either side or the date is invalid.
 */
export function computeEarningsMoves(
  reports: { date: string; surprisePct: number | null }[],
  closes: [string, number][],
): [string, number | null, number | null][] {
  const sorted = closes
    .filter((c) => Array.isArray(c) && isIsoDate(c[0]) && Number.isFinite(c[1]))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return reports.map((r) => {
    let move: number | null = null;
    if (isIsoDate(r.date)) {
      let before: number | null = null;
      let after: number | null = null;
      for (const [d, c] of sorted) {
        if (d < r.date) before = c;
        else if (d > r.date) {
          after = c;
          break;
        }
      }
      if (before !== null && after !== null && before > 0) {
        move = Math.round((after / before - 1) * 10000) / 100;
      }
    }
    return [r.date, r.surprisePct, move];
  });
}
