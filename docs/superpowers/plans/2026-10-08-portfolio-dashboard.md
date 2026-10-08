# Public Portfolio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public Next.js site where anyone uploads holdings as Excel/CSV, image or PDF, confirms the extracted table, and gets the owner's "Two-Broker Ledger" dashboard, computed with the routine's own sources and method.

**Architecture:** Browser parses Excel/CSV locally. Image/PDF go to `/api/extract` (Claude). `/api/analyze` resolves each ticker from a shared per-ticker cache or the adapters (StockAnalysis via Firecrawl, Nasdaq/Zacks, Yahoo), then pure `lib/compute` functions build one `Dashboard` JSON that React components render. Nothing a user uploads is stored.

**Tech Stack:** Next.js (App Router, TypeScript, current stable at install), Vitest, Playwright, zod, read-excel-file, papaparse, @anthropic-ai/sdk, @upstash/redis, Cloudflare Turnstile.

**Spec:** `docs/superpowers/specs/2026-10-08-portfolio-dashboard-design.md`

## Global Constraints

- App lives in `portfolio-dashboard/` at the repo root; USD only; US tickers.
- Limits: 100 holdings; image ≤ 5 MB; PDF ≤ 10 MB and ≤ 10 pages.
- Haircut `k`: 0.75 if n ≥ 20, 0.60 if 8 ≤ n < 20, 0.40 if n < 8; if average < price, haircut target = average.
- Blended Street average = mean of the available values among: S&P tracker average, Zacks average, and the median of named calls dated within 60 days of as-of (used only when ≥ 3 calls).
- Reference level = price × 0.8. Beta adjustment = `0.67·β + 0.33`; 1 when beta is unknown.
- Low confidence = n < 8, or modelled range, or sources > 15% apart (`max/min − 1 > 0.15`), or target age > 30 days.
- Cache TTLs: targets 6 h, prices 5 min, history 24 h. Cache holds market data only, never user data.
- Never log or persist uploaded files or extracted holdings; logs carry counts, timings, error codes only.
- Never commit the owner's positions or history. Only the public `tickers` market data may be used as fixtures.
- Disclaimer, verbatim in the method section: "Analyst targets are opinions and are often wrong. This is a data summary, not investment, tax or legal advice. Check prices and targets before acting."
- Visual tokens, fonts (Big Shoulders Display, IBM Plex Sans/Mono) and light/dark palette are copied from the reference dashboard's `<style>` block.
- Deviation from spec §3: Excel parsing uses `read-excel-file` + `papaparse` instead of SheetJS (the npm SheetJS build is unmaintained with known vulnerabilities). `.xls` is rejected with "save as .xlsx". Spec already updated.
- Deviation from reference: accounts are generic labels (not EIB/XTB); the "Precious metals" shock becomes "Largest sector falls 20%"; the hard-coded "Without ServiceNow" note becomes "Without {largest holding}".

## Review Focus

1. **Ticker forms** (`BRK.B`, `BRK-B`, `brk b`, lowercase, `$NVDA`, exchange suffix `NVDA.US`): normalise to one canonical form and map it per source. Pinned in Task 8.
2. **Cost ambiguity** (per-share average vs total cost; missing cost): the column map records which it is; missing cost shows "—" and excludes that lot from return maths. Pinned in Tasks 4 and 8.
3. **Non-equity or uncovered symbols** (ETFs, crypto, non-US, delisted, no analyst targets): no division by zero; the card shows "No Street target" and is excluded from target scenarios. Pinned in Tasks 3, 5 and 11.
4. **Statement noise** (rows named Total, Cash, Net liquidation; negative or zero shares; fractional shares; European decimals `1.234,56`; `%` and currency symbols): dropped or parsed correctly. Pinned in Tasks 8 and 9.
5. **Degraded data** (empty portfolio; every source down; one ticker unknown among many; same ticker in two accounts): clear empty/partial states, never a blank page or NaN. Pinned in Tasks 4, 12 and 14.

---

### Task 1: Scaffold and tooling

**Files:**
- Create: `portfolio-dashboard/` (Next.js app: `package.json`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`)
- Create: `portfolio-dashboard/lib/types.ts`

**Interfaces:**
- Produces (`lib/types.ts`, used by every later task):
  - `Holding = { ticker: string; shares: number; cost?: number; costKind?: "total" | "perShare"; account?: string; openDate?: string }`
  - `Call = [firm: string, target: number, date: string]`
  - `TargetSet = { avg: number; low: number; high: number; median?: number; n?: number }`
  - `TickerMarket = { ticker: string; name: string; sector?: string; price: number; prevClose: number; beta?: number | null; sp: TargetSet | null; zacks: TargetSet | null; calls: Call[]; tgtDate?: string; modeled?: boolean; next?: { date: string; what: string; conf: boolean }; events?: { date: string; what: string; conf: boolean }[]; er?: { hist: [date: string, surprisePct: number | null, movePct: number | null][] }; closes: [date: string, close: number][]; errors: Record<string, string> }`
  - `Dashboard` (declared in Task 12).

- [ ] **Step 1:** Scaffold with `create-next-app` (TypeScript, App Router, no Tailwind), add dev deps `vitest`, `@playwright/test`, runtime deps `zod`, `read-excel-file`, `papaparse`, `@anthropic-ai/sdk`, `@upstash/redis`. Add scripts `test`, `test:e2e`, `build`.
- [ ] **Step 2:** Write `lib/types.ts` with the types above and a trivial `lib/types.test.ts` asserting a sample `Holding` satisfies the type (compile-time via `satisfies`).
- [ ] **Step 3:** Run `npm test` → PASS; `npm run build` → success.
- [ ] **Step 4:** Commit `chore: scaffold portfolio-dashboard app`.

### Task 2: Market-data fixtures

**Files:**
- Create: `portfolio-dashboard/fixtures/market-2026-10-07.json`, `portfolio-dashboard/fixtures/README.md`

**Interfaces:** Produces `fixtures/market-2026-10-07.json`: `{ asof: "2026-10-07", prevAsof: "2026-10-06", tickers: Record<string, ReferenceTicker> }` where `ReferenceTicker` is the reference dashboard's per-ticker object (`price, cons, low, high, n, tgt, prev, zacks, calls, beta, sector, next, er, modeled?, disputed?`). Task 3 maps it to `TickerMarket`.

- [ ] **Step 1:** Extract only the `tickers` object plus `asof`/`prevAsof` from the saved reference HTML (`<script id="data">` JSON; path: the Artifact read's saved file in the session tool-results) with a one-off script; drop `positions`, `history`, `bench`. Write the JSON.
- [ ] **Step 2:** Verify with `grep -c '"positions"\|"history"' fixtures/market-2026-10-07.json` → `0`.
- [ ] **Step 3:** README notes the fixture is public market data from 2026-10-07 and that positions are deliberately absent. Commit.

### Task 3: `compute/targets`

**Files:**
- Create: `lib/compute/targets.ts`, `lib/compute/targets.test.ts`, `lib/compute/fromReference.ts` (test helper mapping a `ReferenceTicker` to `TickerMarket`)

**Interfaces:**
- Produces:
  - `blendTargets(calls: Call[], asof: string, sp: number | null, zacks: number | null): { cons: number | null; rc: number | null; nc: number; np: number; callLo: number | null; callHi: number | null }`
  - `deriveTarget(m: TickerMarket, asof: string): TargetView` where `TargetView = { cons: number | null; rc: number | null; spread: number; k: 0.75 | 0.6 | 0.4; hc: number | null; ab: number; up: number | null; upH: number | null; upL: number | null; upB: number | null; age: number | null; lowc: boolean; covered: boolean }`
  - `targetStatus(price: number, v: TargetView, low: number, high: number): { label: string; tone: "hot" | "cold" | "" }` with labels from the reference: "▲ Above Street high", "▼ Below Street low", "Above Street average", "Near average" (<10%), "Room to average" (<30%), "Wide gap to average".

- [ ] **Step 1: Write failing tests** (golden values from the fixture, `toBeCloseTo(x, 2)`):
  - `blends NVDA to 325.97`: sp 328.72, zacks 324.2, nine calls within 60 days, median 325 → `cons ≈ 325.97`, `nc = 9`, `np = 3`.
  - `haircuts NVDA to 303.82` (n = 61 → k = 0.75).
  - `blends ADBE to 265.40` and `haircut ≈ 257.23`; `ab ≈ 0.5712` for beta 0.36.
  - `ignores calls older than 60 days`; `uses only sp and zacks when fewer than 3 recent calls`.
  - `haircut equals the average when average is below price`.
  - `flags MRAM low confidence (n = 3)`; `does not flag ADBE`; `flags a target 31 days old`; `flags sources 16% apart`.
  - Review Focus 3: `returns covered:false and null targets when sp and zacks are both null, without NaN`.
  - `adjusts beta: null beta gives ab = 1`.
- [ ] **Step 2:** Run `npx vitest run lib/compute/targets.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement per the signatures, porting reference script lines 5990–6006 and 6013–6020 (`blend`, `kk`, `hc`, `ab`, `lowc`, `status`). Return nulls instead of dividing by zero when no target exists.
- [ ] **Step 4:** Run tests → PASS. Commit `feat: target blend, haircut, confidence`.

### Task 4: `compute/portfolio`

**Files:**
- Create: `lib/compute/portfolio.ts`, `lib/compute/portfolio.test.ts`

**Interfaces:**
- Consumes: `Holding`, `TickerMarket`, `TargetView`.
- Produces:
  - `type Lot = Holding & { value: number; prevValue: number; cost: number | null; pl: number | null; ret: number | null }`
  - `type Position = { ticker: string; name: string; sector: string; lots: Lot[]; qty: number; value: number; cost: number | null; ret: number | null; w: number; dayUsd: number; day: number }`
  - `buildPortfolio(holdings: Holding[], market: Record<string, TickerMarket>): { lots: Lot[]; positions: Position[]; total: number; cost: number | null; prev: number; accounts: { name: string; value: number; cost: number | null }[]; sectors: { name: string; value: number; cost: number | null; tickers: string[] }[]; unpriced: string[] }`

- [ ] **Step 1: Write failing tests:**
  - `total, prev and day change match hand-computed values` for a 3-lot portfolio.
  - Review Focus 5: `same ticker in two accounts merges into one position but keeps two lots`.
  - Review Focus 2: `per-share cost is multiplied by shares; total cost used as is`; `missing cost gives ret null and is excluded from portfolio cost`.
  - Review Focus 3/4: `ticker without market data lands in unpriced and is excluded from totals`; `zero or negative shares are dropped`; `fractional shares are kept`.
  - Review Focus 5: `empty holdings returns zeros and empty arrays`.
  - `weights sum to 1`; `sectors sorted by value descending`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (reference lines 6008–6012). **Step 4:** Run → PASS. Commit.

### Task 5: `compute/risk` and `compute/scenarios`

**Files:**
- Create: `lib/compute/risk.ts`, `lib/compute/scenarios.ts`, and a `.test.ts` for each

**Interfaces:**
- Produces:
  - `concentration(positions: Position[], total: number, limit: number): { over: Position[]; excess: number; top5: number }`
  - `shocks(positions: Position[], views: Record<string, TargetView>, total: number): { label: string; amount: number; note: string }[]` — rows: "{largest} falls 10%", "{largest} falls 20%" (note uses average absolute earnings move from `er.hist` when present), "{largest sector} falls 20%", "Market falls 10%" (sum of `value·ab·0.10`, note includes portfolio beta `Σ w·ab`).
  - `scenarios(positions: Position[], views: Record<string, TargetView>, total: number): { key: "low" | "hc" | "cons" | "high"; value: number; ret: number; driver: { ticker: string; delta: number }; exLargest: number }[]`
- Review Focus 3: positions with no target are held at current value in every case.

- [ ] **Step 1: Write failing tests:** `market shock equals −Σ value·ab·0.10`; `portfolio beta is the weighted adjusted beta`; `concentration flags positions above the limit and sums the excess to bring them to it`; `scenario value is Σ qty·target; uncovered position held at current value`; `driver is the biggest absolute contributor`; `ex-largest return excludes the largest holding`; `single-holding portfolio does not divide by zero in exLargest`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (reference lines 6275–6296, 6339–6352). **Step 4:** Run → PASS. Commit.

### Task 6: `compute/performance` and beta

**Files:**
- Create: `lib/compute/performance.ts`, `lib/compute/performance.test.ts`

**Interfaces:**
- Produces:
  - `computeBeta(stock: [string, number][], spy: [string, number][]): number | null` — daily-return covariance/variance on dates present in both; `null` if fewer than 120 overlapping days.
  - `buildPerformance(lots: Lot[], closes: Record<string, [string, number][]>, bench: { SPY: [string, number][]; QQQ: [string, number][] }, asof: string): { series: { d: string; v: number; c: number; g: number; bSPY?: number; bQQQ?: number }[]; datedLots: number; undatedLots: number } | null`

- [ ] **Step 1: Write failing tests:**
  - `beta of a series equal to 2× SPY returns is 2` ; `beta null with fewer than 120 overlapping days`.
  - `lot enters on its open date; before that it adds nothing`; `undated lots enter at the first date in the series and are counted in undatedLots`.
  - `benchmark invests each cost inflow at that day's close and values at the last close` (hand-computed 2-lot case).
  - `returns null when no lot has a cost`; `missing closes for a ticker skip that ticker and list it`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (reference lines 6204–6212 for the rebuild and benchmark `u += inflow / p.bp[bk]`). **Step 4:** Run → PASS. Commit.

### Task 7: `compute/calendar` and `compute/flags`

**Files:**
- Create: `lib/compute/calendar.ts`, `lib/compute/flags.ts`, and a `.test.ts` for each

**Interfaces:**
- Produces:
  - `buildCalendar(positions: Position[], market: Record<string, TickerMarket>, today: string): { events: { ticker: string; date: string; what: string; conf: boolean; kind: "results" | "event"; days: number }[]; next14: …same[] }` (dates before `today` dropped; sorted ascending).
  - `buildFlags(positions, views, market, calendar, total): { tone: "hot" | "cold" | "info"; key: string; text: string }[]` — rows: results ≤ 14 days, below every target, above the Street, concentration (largest and top five), targets diverge (>10% between recent calls and the S&P tracker), weak targets.
  - `buildChanges(positions, market, views, prevViews, calendar): { key: string; text: string }[]` — target ≥ 5% moves, 1–5% moves, range changes, status crossings, cost crossings, next 14 days, and "No Street average moved 5% or more." when none.

- [ ] **Step 1: Write failing tests:** `drops past events`; `counts results within 14 days`; `flags below-every-target when price < low`; `a 5% move appears as 'Target ≥5%'`; `status crossing reported when price crosses the average between days`; `no flags crash on an empty portfolio`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (reference lines 6024–6027, 6073–6090, 6093–6117). **Step 4:** Run → PASS. Commit.

### Task 8: Spreadsheet parsing and normalisation

**Files:**
- Create: `lib/parse/normalize.ts`, `lib/parse/excel.ts`, `lib/parse/csv.ts`, and a `.test.ts` for each; `lib/parse/__fixtures__/` (small generated sheets)

**Interfaces:**
- Produces:
  - `normalizeTicker(raw: string): string | null` → uppercase canonical form (class shares as `BRK-B`), strips `$`, spaces, `.US`/`:US` suffixes; `null` for blanks and noise rows (`TOTAL`, `CASH`, `NET LIQUIDATION`, `SUBTOTAL`).
  - `parseNumber(raw: unknown): number | null` — handles `1,234.56`, `1.234,56`, `$`, `€`, `%`, parentheses negatives, `(1,234)`, trailing spaces.
  - `guessColumns(headers: string[]): { ticker?: number; shares?: number; cost?: number; costKind?: "total" | "perShare"; account?: number; date?: number }`
  - `mergeDuplicates(h: Holding[]): Holding[]` (same ticker + account + openDate sums shares and cost).
  - `parseSheet(rows: unknown[][], map: ColumnMap): { holdings: Holding[]; warnings: string[] }`
  - `readFileRows(file: File): Promise<{ sheets: { name: string; rows: unknown[][] }[] }>` — `.xlsx` via `read-excel-file`, `.csv` via `papaparse`; `.xls` throws `Error("Save as .xlsx")`.

- [ ] **Step 1: Write failing tests:**
  - Review Focus 1: `normalizes BRK.B, brk b, $NVDA, NVDA.US, ' aapl ' to canonical forms`.
  - Review Focus 4: `drops TOTAL and CASH rows`; `parses '1.234,56' as 1234.56 and '(250)' as −250`; `drops zero and negative shares with a warning`.
  - Review Focus 2: `'Avg price' header gives costKind perShare; 'Cost' or 'Total cost' gives total`; `missing cost column leaves cost undefined`.
  - `finds the header row when the sheet starts with title rows or merged cells`; `empty sheet returns no holdings and a warning`; `merges duplicate lots`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; header detection scans the first 15 rows for the row containing a ticker-like and a shares-like header. **Step 4:** Run → PASS. Commit.

### Task 9: Image/PDF extraction

**Files:**
- Create: `lib/extract/claude.ts`, `lib/extract/claude.test.ts`, `app/api/extract/route.ts`, `app/api/extract/route.test.ts`

**Interfaces:**
- Consumes: `normalizeTicker`, `parseNumber`, `mergeDuplicates` (Task 8); guard from Task 10 (added when Task 10 lands).
- Produces:
  - `ExtractedSchema` (zod): array of `{ ticker: string; shares: number; cost?: number; costKind?: "total" | "perShare"; account?: string; openDate?: string }`
  - `extractHoldings(file: { bytes: Buffer; mediaType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf" }, client?: Pick<Anthropic, "messages">): Promise<{ holdings: Holding[]; warnings: string[] }>` — instruction: holdings table only, never guess, `[]` if none, state whether cost is per-share or total; reply parsed tolerantly (strip fences/prose) then validated with zod; noise rows filtered by `normalizeTicker`.
  - `POST /api/extract` (multipart): 400 on wrong type or size, 422 on invalid model output, 200 `{ holdings, warnings }`.

- [ ] **Step 1: Write failing tests** with a stub client: `parses a fenced JSON reply with prose around it`; `rejects a reply that fails the schema with a clear error`; `drops TOTAL/CASH rows`; `returns [] and a warning when the model returns []`; route: `rejects an image over 5 MB (400)`, `rejects a PDF over 10 MB (400)`, `rejects an unsupported type (400)`, `never logs file bytes or holdings` (spy on `console`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; PDF page-count limit checked with a light parser before the API call (10 pages). **Step 4:** Run → PASS. Commit.

### Task 10: Public-use guards

**Files:**
- Create: `lib/guard/rateLimit.ts`, `lib/guard/turnstile.ts`, `lib/guard/spend.ts`, `lib/guard/guard.test.ts`; Modify: both API routes to call `guardRequest`

**Interfaces:**
- Produces:
  - `guardRequest(req: Request, opts: { route: "extract" | "analyze"; needsCaptcha: boolean }): Promise<{ ok: true } | { ok: false; status: 400 | 429 | 503; code: "captcha" | "rate_limited" | "busy" }>`
  - `rateLimit(key: string, limit: number, windowSec: number): Promise<boolean>` (Upstash-backed; in-memory fallback when env missing, for tests/dev).
  - `verifyTurnstile(token: string | null, ip: string): Promise<boolean>`
  - `spendAllowed(kind: "claude" | "firecrawl"): Promise<boolean>` — daily counter against `DAILY_CLAUDE_CALLS` and `DAILY_FIRECRAWL_CREDITS` env caps.

- [ ] **Step 1: Write failing tests:** `blocks the 11th extract request per IP per hour`; `analyze allows 30 per hour`; `missing or failed Turnstile token returns captcha`; `spend cap reached returns busy (503) and no upstream call is made`; `guard never throws when Redis is unavailable (fails closed for spend, open for rate limit with warning)`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit.

### Task 11: Market-data adapters and cache

**Files:**
- Create: `lib/market/firecrawl.ts`, `stockanalysis.ts`, `nasdaq.ts`, `yahoo.ts`, `earnings.ts`, `cache.ts`, `index.ts`, tests for each, `lib/market/__fixtures__/` (recorded raw responses: StockAnalysis forecast markdown for NVDA, Yahoo chart JSON, Nasdaq responses)

**Interfaces:**
- Produces:
  - `scrape(url: string, opts?: { json?: boolean }): Promise<string>` (Firecrawl API; budget-checked via `spendAllowed`; one retry).
  - `parseStockAnalysisForecast(markdown: string): { sp: TargetSet; calls: Call[]; tgtDate?: string; ratings?: Record<string, number> } | null`
  - `parseNasdaqTargets(json: unknown): TargetSet | null`
  - `parseYahooChart(json: unknown): { name: string; price: number; prevClose: number; closes: [string, number][] }`
  - `fetchEarnings(ticker: string): Promise<{ next?: TickerMarket["next"]; hist: [string, number | null, number | null][] }>`
  - `getTickerMarket(ticker: string, now?: Date): Promise<TickerMarket>` — per-source failures recorded in `errors[source]`; unknown ticker throws `UnknownTicker`; TTLs per Global Constraints; also `getBenchmarks(): Promise<{ SPY; QQQ }>`.
  - `cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T>` (Upstash; in-memory fallback).

- [ ] **Step 1: Record fixtures** (one-off): scrape NVDA forecast, Yahoo `range=1y`, Nasdaq endpoints chosen in step 2; save under `__fixtures__/`.
- [ ] **Step 2 (open items 1–3 of the spec):** probe the Nasdaq target-price and earnings-date endpoints and the StockAnalysis earnings/profile pages; record which fields give next-results date with confirmed flag, sector, and Zacks low/high; write the findings as comments at the top of `nasdaq.ts`/`earnings.ts`. Measure Firecrawl credits per ticker and note them in `docs/superpowers/notes/data-sources.md`.
- [ ] **Step 3: Write failing tests:** `parses NVDA: avg 328.72, low 180, high 515, median 315, n 61, first call is Yorkville Ives 300 on 2026-10-07`; `parser returns null (not wrong numbers) when the page layout changes`; `parseYahooChart returns 5 closes and name for the fixture`; `getTickerMarket records errors.stockanalysis when scrape fails but still returns Yahoo data`; Review Focus 3: `a symbol with no analyst page yields sp null and errors set, not a throw`; `unknown ticker throws UnknownTicker`; `second call within TTL hits the cache (no scrape)`.
- [ ] **Step 4:** Run → FAIL. **Step 5:** Implement. **Step 6:** Run → PASS. Commit per adapter.

### Task 12: `/api/analyze` and `Dashboard` assembly

**Files:**
- Create: `lib/dashboard/build.ts`, `lib/dashboard/build.test.ts`, `app/api/analyze/route.ts`, `app/api/analyze/route.test.ts`

**Interfaces:**
- Consumes: Tasks 3–7 compute, Task 11 `getTickerMarket`/`getBenchmarks`, Task 10 `guardRequest`.
- Produces:
  - `type Dashboard = { asof: string; prevAsof: string; total: number; cost: number | null; prev: number; accounts: …; positions: (Position & { view: TargetView; market: TickerMarket })[]; flags; changes; calendar; risk: { concentration; shocks }; scenarios; sectors; performance: … | null; unpriced: string[]; sourceNotes: { ticker: string; missing: string[] }[] }`
  - `buildDashboard(holdings: Holding[], market: Record<string, TickerMarket>, bench: Benchmarks, today: string): Dashboard`
  - `POST /api/analyze` body `{ holdings: Holding[], turnstile?: string }` → 200 `Dashboard`; ≤ 100 holdings else 400; streams progress as NDJSON lines `{ progress: n, of: m }` then `{ dashboard }`.

- [ ] **Step 1: Write failing tests:** `buildDashboard on the fixture tickers with a synthetic 5-holding portfolio matches hand-computed total, cost and scenarios`; Review Focus 5: `one failed ticker is listed in unpriced and the rest compute`; `all sources failing gives an empty dashboard with sourceNotes, not an exception`; route: `101 holdings → 400`, `guard failure → its status`, `progress lines precede the dashboard line`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with bounded concurrency (5 tickers at a time). **Step 4:** Run → PASS. Commit.

### Task 13: Upload and confirm UI

**Files:**
- Create: `components/UploadStep.tsx`, `components/ConfirmTable.tsx`, `components/ColumnMapper.tsx`, `components/Turnstile.tsx`, `app/page.tsx` (state machine: `upload → confirm → analyzing → dashboard`), component tests (Vitest + Testing Library)

**Interfaces:**
- Consumes: `readFileRows`, `guessColumns`, `parseSheet` (Task 8); `POST /api/extract`, `POST /api/analyze`.
- Produces: `ConfirmTable({ holdings, onChange, onAnalyze })`; rows have inline warnings: unknown ticker (after `/api/analyze` pre-check not needed; flagged when `normalizeTicker` is null), shares ≤ 0, duplicate, missing cost, and an "AI-read — check" tag for extracted rows.

- [ ] **Step 1: Write failing tests:** `dropping an .xls shows 'Save as .xlsx'`; `column mapper pre-fills guesses and lets the user change them`; `Analyze is disabled until at least one valid row exists`; `rows read from an image carry the 'check' tag`; `editing shares updates the row and clears its warning`; `over 100 rows shows the limit message`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; UI copy and look follow the reference tokens. **Step 4:** Run → PASS. Commit.

### Task 14: Dashboard components

Split into three commits; each ports reference markup and CSS, takes `Dashboard` as its only prop, and is wrapped in an error boundary so one failing section shows "This section failed to draw" while the rest render.

**Files:**
- Create: `components/dashboard/Hero.tsx`, `Treemap.tsx` (squarify from reference lines 6051–6072), `Attention.tsx`, `Since.tsx`; `Performance.tsx`, `Risk.tsx`; `Holdings.tsx` (cards with runway chart), `Calendar.tsx`, `Season.tsx`, `Outlook.tsx`, `Method.tsx`; `styles/dashboard.css` (copied tokens); a `.test.tsx` per component

**Interfaces:**
- Consumes: `Dashboard`. Produces: `<DashboardView dashboard={Dashboard} />`.

- [ ] **Step 1 (a — Hero, Treemap, Attention, Since):** failing tests: `hero shows total and day change with sign and colour class`; `treemap tiles sum to the container area and are ordered by value`; `tile has the lowc class for low-confidence tickers`; `attention panel renders 'No holding…' style states for an empty list`. Implement, run → PASS, commit.
- [ ] **Step 2 (b — Performance, Risk, Holdings):** failing tests: `performance section is hidden with the note 'no purchase dates given' when performance is null`; `benchmark toggle switches SPY/QQQ/none`; `holding card with sp null shows 'No Street target' and no runway markers`; `sort and account filters reorder/filter cards`; Review Focus 5: `no NaN or 'Infinity' text anywhere for an empty portfolio`. Implement, PASS, commit.
- [ ] **Step 3 (c — Calendar, Season, Outlook, Method):** failing tests: `season table hidden when no ticker has earnings history`; `method section includes the verbatim disclaimer`; `scenario rows show bear, haircut, average, bull`; `sector mix lists every sector once`. Implement, PASS, commit.

### Task 15: E2E, live smoke, docs, deploy steps

**Files:**
- Create: `e2e/flow.spec.ts`, `e2e/mocks.ts`, `scripts/live-smoke.ts`, `portfolio-dashboard/README.md`, `portfolio-dashboard/DEPLOY.md`

- [ ] **Step 1: Write failing E2E** (Playwright, headless Chromium from `/opt/pw-browsers`, APIs mocked): `xlsx upload → confirm → dashboard shows total`; `image upload shows 'check' tags then dashboard`; `pdf upload happy path`; `one ticker blocked shows its card as unavailable and the rest render`; `captcha failure shows the message and keeps the table`; `101 rows blocked`.
- [ ] **Step 2:** Run → FAIL; implement fixes; run → PASS.
- [ ] **Step 3:** `scripts/live-smoke.ts <holdings.csv>` runs real adapters for a user-supplied CSV and prints each ticker's blended target next to a value passed on the command line, so the owner can compare against the routine's latest dashboard. (Not run in CI; needs keys.)
- [ ] **Step 4:** `DEPLOY.md`: env vars (`ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `DAILY_CLAUDE_CALLS`, `DAILY_FIRECRAWL_CREDITS`), Vercel import steps, Turnstile and Upstash setup, spend-cap advice, and a plain statement of the scraping-terms risk.
- [ ] **Step 5:** Run `npm test && npm run test:e2e && npm run build` → all pass. Commit; push.

## Plan self-review

- **Spec coverage:** goal/inputs (Tasks 8, 9, 13); sources (11); methodology (3–7); architecture (1, 11, 12); flow (13, 14); safeguards (10); error handling (11, 12, 14); testing (every task, 15); owner needs (15 `DEPLOY.md`); open items 1–4 (Task 11 steps 1–2; cache store fixed as Upstash).
- **Types:** `TickerMarket`, `TargetSet`, `Lot`, `Position`, `TargetView`, `Dashboard` are defined once (Tasks 1, 3, 4, 12) and reused with the same names.
- **Proportion:** plan carries signatures, test names and spec values only; formulas are referenced by reference-script line numbers instead of copied.
