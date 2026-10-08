# Public Portfolio Dashboard — Design Spec

Date: 2026-10-08
Status: draft, awaiting review
Replaces the earlier artifact-hosted draft, which could not be public (see §2).
Reference dashboard: the "Two-Broker Ledger" artifact refreshed by the routine *My Stock Portfolio Analysis*.

## 1. Goal

A public website where anyone uploads their holdings as **Excel/CSV, an image, or a PDF**, confirms the extracted table, and gets the same dashboard the routine produces: hero totals, treemap, since-last-close, performance vs SPY/QQQ, risk, holdings cards, results calendar, earnings season, 12-month scenarios, sector mix, method notes.

**Success criteria**
- Public URL, no sign-in, nothing required from the visitor.
- Accepts `.xlsx/.xls/.csv`, PNG/JPEG/WebP screenshots, and PDF statements.
- For the owner's holdings, the numbers match the routine's dashboard: same sources, same methodology. Check: NVDA's Street average is $328.72 on 61 analysts (low 180, high 515), as in the 7–8 Oct dashboard.
- Uploaded holdings are never stored. Only anonymous per-ticker market data is cached.
- Every section degrades gracefully when a source fails.

## 2. Why not an artifact

An artifact page's network is blocked, `mcp`/`sample` run on the viewer's own accounts, and `mcp` bars public sharing. A public page with no viewer prerequisites therefore needs a server holding the API keys. A published artifact may still serve as a landing page that links to the app; it cannot run it.

## 3. Decisions

| Topic | Decision |
|---|---|
| Stack | Next.js (App Router, TypeScript), deployed on Vercel |
| Data sources | The same as the routine (see §4), fetched server-side |
| Scraping | Via the Firecrawl API where direct requests are blocked; direct where they work |
| Image/PDF reading | Claude API (vision and native PDF), server-side |
| Excel/CSV | Parsed in the browser with SheetJS; the file never leaves the device |
| User data | Stateless, in memory only |
| Market data cache | Shared, per ticker, no user data (Upstash Redis or Vercel KV) |
| Currency | USD only in v1 |
| Style | Port of the existing look (Big Shoulders Display, IBM Plex, light/dark tokens) |

**Accepted risk, stated plainly:** StockAnalysis, Nasdaq/Zacks and Yahoo are not licensed APIs. Scraping may breach their terms and can break or be blocked without notice. Mitigations: per-source adapters with schema validation, caching to keep request volume low, per-field graceful degradation, a visible "source unavailable" state, and the option to add FMP as a fallback provider later. The owner takes the terms-of-service decision.

## 4. Data sources (mirroring the routine)

| Field | Source | Access (probed 2026-10-08) |
|---|---|---|
| Street average, low, high, median, analyst count, rating mix, latest named calls | StockAnalysis `/stocks/{t}/forecast/` | 403 direct from a cloud IP; works through Firecrawl. NVDA matched the dashboard exactly |
| Zacks average, low, high | Nasdaq analyst target-price endpoint | Responds 200 directly; response shape to be confirmed in the plan phase |
| Named analyst targets (last 60 days) | StockAnalysis latest-forecasts table | Same page as above |
| Daily closes, 52-week range, name | Yahoo chart JSON `/v8/finance/chart/{t}` | Works directly and through Firecrawl |
| Beta | Computed from one year of Yahoo daily returns vs SPY, adjusted `0.67·β + 0.33` | Derived |
| Next results date, EPS estimate, last four reports and price reactions | Nasdaq earnings endpoints / StockAnalysis | To be confirmed in the plan phase; confirmed vs estimated is taken from the source's flag when present |
| Sector | Yahoo/StockAnalysis profile | To be confirmed |

Dropped from v1: per-card free-text "notes" and news (the routine writes these with live web search). Possible later addition: an optional AI-written note per holding.

## 5. Architecture

```
app/
  page.tsx                 upload → confirm → dashboard (single page, client state)
  api/extract/route.ts     POST image|pdf → Claude → holdings JSON
  api/analyze/route.ts     POST holdings → Dashboard JSON
lib/
  parse/excel.ts           SheetJS, header guessing, column remap
  parse/normalize.ts       tickers, numbers, merge duplicates
  extract/claude.ts        vision/PDF prompt + zod validation
  market/                  one adapter per source, each returns typed data or an error code
    stockanalysis.ts  nasdaq.ts  yahoo.ts  earnings.ts
    cache.ts               per-ticker TTL cache (targets 6 h, prices 5 min, history 24 h)
    firecrawl.ts           scraping client with retry and budget guard
  compute/                 pure functions, unit-tested, no I/O
    targets.ts  portfolio.ts  risk.ts  scenarios.ts  performance.ts  calendar.ts
  guard/                   rate limit, Turnstile verification, size and count limits, spend cap
components/dashboard/      one component per dashboard section
```

`compute/` takes `Holding[]` + `MarketRow[]` and returns `Dashboard`. The UI only renders it.

## 6. Flow

1. **Upload.** Drop zone for Excel/CSV, image, PDF. Excel is parsed locally with a column-mapping step. Images and PDFs go to `/api/extract` after a bot check.
2. **Extract.** Claude returns `[{ticker, shares, cost?, account?, openDate?}]` under a strict instruction ("holdings only; do not guess; return `[]` if none"), validated with zod. Rows read by AI are marked "check".
3. **Confirm.** Editable table with warnings (unknown ticker, shares ≤ 0, duplicate). Nothing is analyzed until the user clicks Analyze.
4. **Analyze.** `/api/analyze` resolves each ticker from cache or sources with bounded concurrency, streams progress, tolerates per-ticker and per-field failure, and returns the `Dashboard`.
5. **View.** Sections render in the owner's order. Edit and re-analyze without reloading. Optional "Save my holdings (.json)" for a later reload.

## 7. Methodology (ported unchanged)

- **Street average (blended):** mean of up to three 12-month target averages: S&P Global via StockAnalysis, Zacks via Nasdaq, and the median of named analyst targets from the last 60 days (used only when at least 3 exist).
- **Street range:** lowest and highest target in the S&P Global set. If no live target exists, carry the last published target forward with a modelled, hatched band (as in the current dashboard).
- **Haircut target:** `price + k × (average − price)`, k = 0.75 for 20+ analysts, 0.60 for 8–19, 0.40 for fewer than 8. If average < price, use the average.
- **Reference level:** 20% below today's price (a sizing marker, not an instruction).
- **Low confidence:** fewer than 8 analysts, a modelled range, sources more than 15% apart, or a target not updated in 30 days.
- **Market shock:** each stock's beta vs SPY over one year of daily returns, adjusted `0.67·β + 0.33`; single events from today's value.
- **12 months out:** current shares × each target case, summed, measured from today's value.
- **Performance:** daily closes × current shares from each position's open date; if no date is given, from the first date shown and labelled so; benchmark puts each cost into SPY or QQQ at that day's close, price only. Without any dates, show gain vs cost only and hide the curve.
- **Disclaimer carried over:** a data summary, not investment, tax or legal advice.

## 8. Public-use safeguards

- Per-IP rate limits on both routes; Cloudflare Turnstile on extract and analyze.
- Limits: 5 MB per image, 10 MB and 10 pages per PDF, 100 holdings.
- Daily spend caps on the Anthropic key and the Firecrawl budget; when hit, the UI says the service is busy instead of failing silently.
- No logging of uploaded contents or extracted holdings; logs hold only counts, timings and error codes.
- Uploaded files are read in memory and dropped; extraction responses are not cached.

## 9. Error handling

- Source down or blocked: that field is "unavailable", the card shows a low-confidence chip, and the rest renders. If StockAnalysis fails but Zacks works, the blend uses what is available and says so.
- Unknown or delisted ticker: flagged at the confirm step and again at analysis; excluded from totals with an explicit note.
- Extraction failure or empty result: offer manual entry or retry; never invent holdings.
- Firecrawl or Anthropic budget exhausted: clear "busy, try later" state.

## 10. Testing

- **Unit:** every `compute/` function against golden inputs and outputs lifted from the owner's current data block (blend, haircut, upside, shocks, scenarios, sector mix), plus edge cases (no targets, average below price, one holding, duplicate tickers across accounts).
- **Adapters:** recorded fixtures from each source, with tests that a changed page layout produces a clear parse error instead of wrong numbers.
- **Parsers:** clean sheet, messy headers, multi-account, thousands separators and currency symbols, empty sheet; extraction output with extra prose.
- **E2E (Playwright):** upload → confirm → dashboard with sources and Claude mocked; blocked-source path; limit and bot-check paths.
- **Live smoke test (manual):** run the owner's real holdings and compare to the routine's latest dashboard.

## 11. Needs from the owner

- Anthropic API key; Firecrawl API key; a Vercel account (and Upstash/KV store); Cloudflare Turnstile keys. These go in as server environment variables. This session cannot deploy to Vercel, so I will deliver the tested repo and exact deploy steps.
- A decision on scraping terms-of-service risk (§3).

## 12. Out of scope (v1)

Multi-currency, saved accounts or portfolios, transaction-level history, non-US exchanges beyond what the sources return, AI-written per-stock notes, native mobile app.

## 13. Open items for the plan phase

1. Confirm the Nasdaq/Zacks target-price response shape and the Nasdaq/StockAnalysis earnings-date endpoints, including the confirmed-vs-estimated flag.
2. Confirm sector source.
3. Measure Firecrawl credits per ticker and set cache TTLs to fit a realistic budget.
4. Choose the cache store (Upstash Redis vs Vercel KV).
