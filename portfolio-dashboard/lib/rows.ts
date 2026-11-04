import { mergeDuplicates, normalizeTicker, parseNumber } from "@/lib/parse/normalize";
import type { Holding } from "@/lib/types";

/** Editable (string-typed) form of a holding used by the confirm table. */
export type Row = {
  id: string;
  ticker: string;
  shares: string;
  cost: string;
  costKind: "total" | "perShare";
  account: string;
  openDate: string;
  source?: "ai";
};

let seq = 0;
const nextId = () => `r${++seq}`;

export function newRow(): Row {
  return { id: nextId(), ticker: "", shares: "", cost: "", costKind: "total", account: "", openDate: "" };
}

export function holdingToRow(h: Holding, source?: "ai"): Row {
  return {
    id: nextId(),
    ticker: h.ticker,
    shares: String(h.shares),
    cost: h.cost === undefined ? "" : String(h.cost),
    costKind: h.costKind ?? "total",
    account: h.account ?? "",
    openDate: h.openDate ?? "",
    ...(source ? { source } : {}),
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function sharesOf(r: Row): number | null {
  const n = parseNumber(r.shares.trim());
  return n !== null && n > 0 ? n : null;
}
function costOf(r: Row): number | null {
  if (r.cost.trim() === "") return null;
  const n = parseNumber(r.cost.trim());
  return n !== null && n >= 0 ? n : null;
}

export const isBlankRow = (r: Row): boolean =>
  !r.ticker.trim() && !r.shares.trim() && !r.cost.trim() && !r.account.trim() && !r.openDate;
export const isValidRow = (r: Row): boolean => normalizeTicker(r.ticker) !== null && sharesOf(r) !== null;

export type RowIssues = { ticker?: string; shares?: string; cost?: string; duplicate?: string };

const dupKey = (r: Row): string | null => {
  const t = normalizeTicker(r.ticker);
  return t ? JSON.stringify([t, r.account.trim(), r.openDate]) : null;
};

/** Occurrences of each ticker+account+date key, for O(n) duplicate detection. */
export function dupCounts(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = dupKey(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function rowIssues(r: Row, dups: Map<string, number>): RowIssues {
  const out: RowIssues = {};
  if (isBlankRow(r)) return out;
  if (r.ticker.trim() && normalizeTicker(r.ticker) === null) out.ticker = "Ticker not recognised";
  else if (!r.ticker.trim()) out.ticker = "Ticker is required";
  if (sharesOf(r) === null) out.shares = "Shares must be greater than 0";
  if (r.cost.trim() === "") out.cost = "No cost: excluded from return";
  else if (costOf(r) === null) out.cost = "Cost isn't a valid number: excluded from return";
  const k = dupKey(r);
  if (k && (dups.get(k) ?? 0) > 1)
    out.duplicate = "Duplicate (same ticker, account and date) — will be merged when you analyze";
  return out;
}

export function rowToHolding(r: Row): Holding | null {
  const ticker = normalizeTicker(r.ticker);
  const shares = sharesOf(r);
  if (!ticker || shares === null) return null;
  const h: Holding = { ticker, shares };
  const cost = costOf(r);
  if (cost !== null) {
    h.cost = cost;
    h.costKind = r.costKind;
  }
  const account = r.account.trim();
  if (account) h.account = account;
  if (ISO.test(r.openDate)) h.openDate = r.openDate;
  return h;
}

/** Valid rows only, normalised (not merged). */
export function validHoldings(rows: Row[]): Holding[] {
  return rows.map(rowToHolding).filter((h): h is Holding => h !== null);
}

/** What gets sent for analysis: valid rows, duplicates merged. */
export const holdingsToAnalyze = (rows: Row[]): Holding[] => mergeDuplicates(validHoldings(rows));
