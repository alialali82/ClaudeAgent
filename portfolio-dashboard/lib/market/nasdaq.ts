// Pure parser for api.nasdaq.com analyst target-price JSON (Zacks consensus).
// Shape recorded 2026-11-04 (see __fixtures__/nasdaq-targetprice-nvda.json):
//   { data: { consensusOverview: { lowPriceTarget, highPriceTarget, priceTarget (= mean), buy, sell, hold }, ... },
//     status: { rCode } }
// There is NO analyst-count field (buy+hold+sell is a rating count and is deliberately not used as `n`).
// Unknown symbols come back as HTTP 200 with `data: null`.
// Earnings-date / surprise parsers live in earnings.ts.
import type { TargetSet } from "../types";
import { isRecord, parseMoney } from "./util";

export function parseNasdaqTargets(json: unknown): TargetSet | null {
  try {
    if (!isRecord(json) || !isRecord(json.data)) return null;
    const co = json.data.consensusOverview;
    if (!isRecord(co)) return null;
    const low = parseMoney(co.lowPriceTarget);
    const high = parseMoney(co.highPriceTarget);
    const avg = parseMoney(co.priceTarget);
    if (low === null || high === null || avg === null) return null;
    if (low <= 0 || !(low <= avg && avg <= high)) return null;
    const out: TargetSet = { avg, low, high };
    const n = parseMoney(co.n);
    if (n !== null && Number.isInteger(n) && n > 0) out.n = n;
    return out;
  } catch {
    return null;
  }
}

/**
 * api.nasdaq.com/api/company/<T>/company-profile (recorded 2026-11-04): data.Sector = { label, value }.
 * value is null for some symbols (e.g. BRK.B) and data is null for unknown symbols.
 */
export function parseNasdaqProfile(json: unknown): { sector: string } | null {
  try {
    if (!isRecord(json) || !isRecord(json.data) || !isRecord(json.data.Sector)) return null;
    const v = json.data.Sector.value;
    if (typeof v !== "string" || !v.trim()) return null;
    return { sector: v.trim() };
  } catch {
    return null;
  }
}
