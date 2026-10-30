import type { Holding } from "../types";

/* ------------------------------------------------------------------ */
/* Tickers                                                             */
/* ------------------------------------------------------------------ */

const NOISE_RE =
  /^(?:GRAND\s+TOTAL|SUB\s*TOTAL|TOTALS?|CASH|NET\s+LIQUIDATION(?:\s+VALUE)?|BALANCE|PORTFOLIO)(?![A-Z0-9])/;
const TICKER_RE = /^[A-Z][A-Z0-9]{0,5}(-[A-Z])?$/;
// Single letters that are far more likely to be an exchange suffix than a
// share class: .L London, .T Tokyo, .V TSX-V, .F Frankfurt, .N NYSE, .O Nasdaq.
// "BP.L" must be rejected while "BRK.B" becomes "BRK-B".
const EXCHANGE_LETTERS = new Set(["L", "T", "V", "F", "N", "O"]);

/** True for summary rows such as TOTAL, CASH or NET LIQUIDATION. */
export function isNoiseTicker(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return NOISE_RE.test(raw.trim().toUpperCase());
}

/** Canonical (Yahoo style) ticker, or null for blanks, noise rows and anything unrecognisable. */
export function normalizeTicker(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toUpperCase();
  if (!s || NOISE_RE.test(s)) return null;
  s = s.replace(/^\$/, "").trim();
  s = s.replace(/(?<=.)[.:\s]US$/, ""); // NVDA.US, NVDA:US, NVDA US
  s = s.replace(/^[A-Z]+:(?=.)/, ""); // NASDAQ:NVDA
  const cls = /^([A-Z0-9]+)([.\s/-])([A-Z])$/.exec(s);
  if (cls) {
    if (cls[2] === "." && EXCHANGE_LETTERS.has(cls[3])) return null;
    s = `${cls[1]}-${cls[3]}`;
  }
  return TICKER_RE.test(s) ? s : null;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

const THOUSANDS_COMMA = /^[1-9]\d{0,2}(,\d{3})+$/;
const THOUSANDS_DOT = /^[1-9]\d{0,2}(\.\d{3})+$/;

/** Locale-tolerant number parsing. Returns null (never NaN/Infinity) when unreadable. */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw
    .replace(/USD|EUR|GBP/gi, "")
    .replace(/[$€£%+]/g, "")
    .replace(/[\s   ]/g, "");
  let negative = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    negative = true;
    s = paren[1];
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[0-9.,]*[0-9][0-9.,]*$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // The last separator is the decimal one.
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    if (THOUSANDS_COMMA.test(s)) s = s.replace(/,/g, "");
    else if (s.indexOf(",") === lastComma) s = s.replace(",", ".");
    else return null;
  } else if (lastDot >= 0) {
    if (s.indexOf(".") !== lastDot && !THOUSANDS_DOT.test(s)) return null;
    if (s.indexOf(".") !== lastDot) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const signed = negative ? -n : n;
  return signed === 0 ? 0 : signed;
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

export type ColumnMap = {
  headerRow: number;
  ticker?: number;
  shares?: number;
  cost?: number;
  costKind?: "total" | "perShare";
  account?: number;
  date?: number;
};

const norm = (h: unknown): string =>
  (typeof h === "string" || typeof h === "number" ? String(h) : "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COSTISH = /\b(cost|price|paid|avg|average|basis|invested|book|value)\b/;
const NOT_COST = /\b(market|current|last|gain|loss|return|pnl|day|change|yield)\b/;

const matchers = {
  ticker: (h: string, strict: boolean) =>
    /\b(symbol|ticker|instrument|security|stock|code)\b/.test(h) &&
    !(strict && /\b(name|description|type|class)\b/.test(h)),
  // Shares are allocated before cost, so "Position" becomes shares; headers that
  // also carry cost/value words ("Position value", "Cost per share") are not shares.
  shares: (h: string) => /\b(shares|qty|quantity|units|position|positions)\b/.test(h) && !COSTISH.test(h),
  account: (h: string) => /\b(account|broker|portfolio|custodian)\b/.test(h) && !COSTISH.test(h),
  date: (h: string) => /\b(date|acquired|opened)\b/.test(h),
  cost: (h: string) =>
    /\b(cost|basis|invested|paid|avg|average)\b|book value|unit price|purchase price/.test(h) && !NOT_COST.test(h),
};

function costKindOf(h: string): "total" | "perShare" {
  if (/\b(avg|average|paid)\b|per share|per unit|unit price|unit cost|purchase price/.test(h)) return "perShare";
  return "total"; // total / basis / book value / invested / bare "cost"
}

/** Map header cells to fields. First match wins per field; a column is never used twice. */
export function guessColumns(headers: string[]): ColumnMap {
  const hs = (Array.isArray(headers) ? headers : []).map(norm);
  const used = new Set<number>();
  const pick = (pred: (h: string) => boolean): number | undefined => {
    const i = hs.findIndex((h, idx) => h !== "" && !used.has(idx) && pred(h));
    if (i >= 0) used.add(i);
    return i >= 0 ? i : undefined;
  };
  const ticker = pick((h) => matchers.ticker(h, true)) ?? pick((h) => matchers.ticker(h, false));
  const shares = pick(matchers.shares);
  const account = pick(matchers.account);
  const date = pick(matchers.date);
  const cost = pick(matchers.cost);
  const map: ColumnMap = { headerRow: 0 };
  if (ticker !== undefined) map.ticker = ticker;
  if (shares !== undefined) map.shares = shares;
  if (cost !== undefined) {
    map.cost = cost;
    map.costKind = costKindOf(hs[cost]);
  }
  if (account !== undefined) map.account = account;
  if (date !== undefined) map.date = date;
  return map;
}

/** Index of the first row (within the first 15) holding both a ticker-like and a shares-like header; -1 if none. */
export function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(15, rows.length);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const m = guessColumns(row as string[]);
    if (m.ticker !== undefined && m.shares !== undefined) return i;
  }
  return -1;
}

/** Convenience: locate the header row and map its columns, or null when no header is found. */
export function detectColumns(rows: unknown[][]): ColumnMap | null {
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) return null;
  return { ...guessColumns(rows[headerRow] as string[]), headerRow };
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

function isoFromParts(y: number, m: number, d: number): string | undefined {
  if (y < 1900 || y > 2100) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return dt.toISOString().slice(0, 10);
}

function isoFromDate(dt: Date): string | undefined {
  if (Number.isNaN(dt.getTime())) return undefined;
  return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function isoFromSerial(n: number): string | undefined {
  if (!Number.isFinite(n) || n < 1 || n > 80000) return undefined;
  return isoFromDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000));
}

function parseDate(raw: unknown): string | undefined {
  if (raw instanceof Date) return isoFromDate(raw);
  if (typeof raw === "number") return isoFromSerial(raw);
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    return a > 12 ? isoFromParts(+m[3], b, a) : isoFromParts(+m[3], a, b); // M/D/YYYY unless first part > 12
  }
  if (/^\d{5}$/.test(s)) return isoFromSerial(Number(s));
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Sheet -> holdings                                                   */
/* ------------------------------------------------------------------ */

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export function parseSheet(
  rows: unknown[][],
  map: ColumnMap,
): { holdings: Holding[]; warnings: string[] } {
  const empty = { holdings: [] as Holding[], warnings: ["No holdings found"] };
  if (!Array.isArray(rows) || rows.length === 0) return empty;
  if (map.ticker === undefined) return { holdings: [], warnings: ["Could not find a ticker column"] };
  if (map.shares === undefined) return { holdings: [], warnings: ["Could not find a shares column"] };

  const holdings: Holding[] = [];
  const warnings: string[] = [];
  for (let i = map.headerRow + 1; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const n = i + 1; // 1-based sheet row
    const rawTicker = row[map.ticker];
    if (isBlank(rawTicker)) continue;
    const tickerText =
      typeof rawTicker === "string" || typeof rawTicker === "number" ? String(rawTicker) : "";
    if (isNoiseTicker(tickerText)) continue;
    const ticker = normalizeTicker(tickerText);
    if (!ticker) {
      warnings.push(`Row ${n}: could not read a ticker from "${tickerText || String(rawTicker)}"`);
      continue;
    }
    const shares = parseNumber(row[map.shares]);
    if (shares === null || shares <= 0) {
      warnings.push(`Row ${n}: shares must be positive`);
      continue;
    }
    const h: Holding = { ticker, shares };
    if (map.cost !== undefined) {
      const cost = parseNumber(row[map.cost]);
      if (cost !== null && cost < 0) warnings.push(`Row ${n}: cost must not be negative`);
      else if (cost !== null) {
        h.cost = cost;
        h.costKind = map.costKind ?? "total";
      }
    }
    if (map.account !== undefined) {
      const a = row[map.account];
      const t = typeof a === "string" || typeof a === "number" ? String(a).trim() : "";
      if (t) h.account = t;
    }
    if (map.date !== undefined) {
      const d = parseDate(row[map.date]);
      if (d) h.openDate = d;
    }
    holdings.push(h);
  }
  if (holdings.length === 0 && warnings.length === 0) return empty;
  return { holdings, warnings };
}

/* ------------------------------------------------------------------ */
/* Duplicates                                                          */
/* ------------------------------------------------------------------ */

const totalCost = (h: Holding): number =>
  // A cost with no kind is treated as a total.
  (h.cost as number) * (h.costKind === "perShare" ? h.shares : 1);

/**
 * Merge lots with the same ticker + account + openDate. Costs merge only when
 * both lots have one (via totals); a costed and an uncosted lot stay separate.
 */
export function mergeDuplicates(holdings: Holding[]): Holding[] {
  const out: Holding[] = [];
  const index = new Map<string, number>();
  for (const h of holdings) {
    const key = JSON.stringify([h.ticker, h.account ?? null, h.openDate ?? null, h.cost !== undefined]);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...h });
      continue;
    }
    const prev = out[at];
    const merged: Holding = { ...prev, shares: prev.shares + h.shares };
    if (h.cost !== undefined) {
      merged.cost = totalCost(prev) + totalCost(h);
      merged.costKind = "total";
    }
    out[at] = merged;
  }
  return out;
}
