# Portfolio Dashboard Artifact — Design Spec

Date: 2026-10-08
Status: ON HOLD. Superseded by a new requirement (public, no viewer prerequisites). Sections 2, 4 and 6 need rework once the hosting decision is made.
Source dashboard: the "Two-Broker Ledger" artifact refreshed by the routine *My Stock Portfolio Analysis*.

## 1. Goal

A single Artifact (hosted page) where a user uploads their holdings as an Excel/CSV file or a screenshot, confirms the extracted table, and gets the same dashboard the routine produces for the owner: hero totals, treemap, movers, performance, risk, holdings cards, results calendar, scenarios, method notes.

**Success criteria**
- Upload a spreadsheet or screenshot, confirm, and see the dashboard with no code and no API keys.
- For the owner's current holdings, the compute layer reproduces the existing artifact's derived numbers (blended target, haircut target, upside, risk shock, scenarios, sector mix) within rounding, given the same inputs.
- Nothing the user uploads is stored anywhere. Holdings live in the browser tab only.
- Every section degrades gracefully when market data is missing.

## 2. Constraints and decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Host | Artifact (static HTML, no server, no database) |
| Market data | FMP, via the `mcp` capability, calling the **viewer's own** FMP connector |
| Screenshot reading | `sample` capability with `images: true` (viewer's own Claude usage, no API key) |
| Spreadsheet parsing | In the browser with SheetJS from cdnjs; the file never leaves the device |
| Sharing | Private or org-only. `mcp` bars public links, and viewers need the FMP connector |
| Currency | USD only in v1 |
| Style | Port of the existing look: Big Shoulders Display + IBM Plex, light/dark tokens |

**Consequence to state in the UI and in the handover:** a viewer without the FMP connector sees the upload and confirm steps but gets a clear "connect FMP" state instead of a dashboard. This is not a public product.

## 3. Verified FMP capabilities (probed 2026-10-08, on the owner's plan)

| Need | Endpoint | Result |
|---|---|---|
| Price, change %, beta, sector, name | `company.profile-symbol` (one symbol per call) | Works. Returns `price`, `changePercentage`, `beta`, `sector`, `companyName`, `currency` |
| Price only | `quote.quote-short` (one symbol) | Works |
| Batch quotes | `quote.batch-quote` | **Denied** (Premium plan) |
| Target consensus, high, low, median | `analyst.price-target-consensus` | Works |
| Analyst count and recency | `analyst.price-target-summary` | Works. Fields: `lastMonthCount`, `lastQuarterCount`, `lastYearCount` and the matching averages |
| Price history (EOD close) | `chart.historical-price-eod-light` with `from_date`/`to_date` | Works |
| Upcoming earnings by date range | `calendar.earnings-calendar` with `from_date`/`to_date` | Works. Returns `date`, `epsEstimated`. Whether it covers every symbol must be checked in the plan phase |
| Per-company earnings history | `calendar.earnings-company` | **Denied** with `limit`; unverified without it |

Viewers' plans differ. The design treats every field as optional.

**Gaps against the owner's dashboard, accepted for v1**
- No per-card news notes and no named-analyst call list; the Street range comes from FMP low/high.
- One consensus source (FMP) instead of the S&P/Zacks/named-calls blend. "Blended target" becomes "Street consensus (FMP)". `median` is shown as a cross-check, and a gap above 15% between consensus and median counts as low confidence.
- The "Earnings season" history table (last four reports and price reactions) needs `earnings-company`. It is shown only if that endpoint works for the viewer, otherwise hidden.
- Confirmed vs estimated results dates cannot be told apart; all are labelled "per FMP calendar".

## 4. Architecture

One HTML file, built from source modules by a small Node script and published with the Artifact tool.

```
portfolio-dashboard/
  src/
    compute/        pure functions, no DOM, no capabilities (unit-tested in Node)
      targets.js    consensus, haircut k, low-confidence flags, reference level
      portfolio.js  positions, totals, weights, account split, sector mix
      risk.js       beta-adjusted shocks, concentration
      scenarios.js  bear / average / bull, 12 months out
      performance.js  gain curve and SPY/QQQ benchmark from cost dates
      calendar.js   countdowns, grouping, timeline positions
    parse/
      excel.js      SheetJS → rows → column mapping guess → holdings
      image.js      sample.json prompt + schema check → holdings
      normalize.js  ticker cleanup, number parsing, dedupe/merge by ticker+account
    market/
      fmp.js        mcp wrapper: concurrency-limited fetch per ticker, per-field error capture
    ui/             render functions, one per dashboard section, plus upload and confirm table
    template.html   page shell, CSS tokens, fonts
  build.mjs         inlines src into dist/index.html
  test/             node:test suites + fixtures
  fixtures/golden.json   inputs and expected outputs lifted from the existing artifact
```

Capabilities declared: `mcp` (server `FMP`, tools `company`, `analyst`, `chart`, `calendar`, `quote`), `sample` (`images: true`), `downloads`. No `db`, `assets` or `artifact`, because nothing is persisted.

## 5. Data model

```
Holding   { ticker, shares, cost?, account?, openDate? }          // user input, confirmed
MarketRow { ticker, price, changePct, beta, sector, name,
            target: {consensus, median, low, high, nQuarter, nMonth},
            nextEarnings?: {date}, history?: [{d, close}], errors: {field: code} }
Dashboard { asof, totals, positions[], accounts[], movers[], risk, scenarios,
            calendar, performance?, sectors[], flags[], methodNotes }
```

`Dashboard` is produced by pure functions from `Holding[]` + `MarketRow[]`. The UI only renders it.

## 6. Flow

1. **Upload.** Drop zone accepts `.xlsx/.xls/.csv` and images (PNG, JPEG, WebP).
   - Spreadsheet: pick sheet, guess columns (Ticker/Symbol, Shares/Qty/Quantity, Cost/Avg price/Average cost, Account/Broker, Date), allow remap, build holdings.
   - Image: `sample.json` with `images`, a strict instruction ("holdings table only; ticker, shares, average cost; return `[]` if none visible; do not guess"), validated field by field. Check `sample.limits().images` first and hide the image option if absent.
2. **Confirm table.** Editable cells, add/delete row, per-row warnings (unrecognised ticker, shares ≤ 0, cost missing, duplicate). Nothing proceeds to analysis without an explicit "Analyze" click. Rows from images are marked "read from image — check".
3. **Analyze.** Fetch market data per ticker with limited concurrency, showing progress per ticker. Validate unknown tickers via `search.search-symbol`. Failures are recorded per field and never abort the run.
4. **Render.** Sections appear in the owner's order. Re-upload or edit-and-reanalyze without reloading.
5. **Optional save.** `downloads.save` exports holdings as JSON (and a reload path via the upload step accepting that JSON).

## 7. Methodology (ported unchanged where data allows)

- **Street consensus:** FMP `targetConsensus`; range = `targetLow`…`targetHigh`.
- **Haircut target:** `price + k × (consensus − price)` with k = 0.75 for 20+ analysts, 0.60 for 8–19, 0.40 for under 8. If consensus < price, use consensus. Analyst count is `lastQuarterCount` (fall back to `lastYearCount` if the quarter count is 0).
- **Reference level:** 20% below today's price (a sizing marker, not advice).
- **Low confidence:** fewer than 8 analysts, no usable range, consensus/median gap > 15%, or no target data.
- **Market shock:** beta from FMP, adjusted `0.67·β + 0.33`; single-event shocks on today's value.
- **12 months out:** current shares × each target case (low / consensus / high), summed, measured from today's value.
- **Performance:** cost-basis curve from `openDate` (when provided) using EOD closes; benchmark puts each cost into SPY or QQQ on the same date, price-only. If no dates are provided, show gain vs cost only and hide the curve and benchmark.
- **Disclaimer:** carried over verbatim (data summary, not investment, tax or legal advice).

## 8. Error handling

- `mcp` is `null` or `server_not_connected`: show a "Connect FMP in Settings → Connectors" state; upload and confirm still work.
- `not_in_manifest`, `blocked_by_policy`, `approval_required`: that section is "not allowed"; no auto-retry.
- `needs_reauth`: reconnect message.
- Plan-tier denials (`tool_error` with an access-denied message) are recorded per field; affected sections show "not available on your FMP plan" and the dashboard still renders from the rest.
- `server_unavailable` / `upstream_error` marked `retryable`: one randomized-delay retry for reads, then a per-ticker "failed — retry" control.
- `sample` errors: `not_granted`/`sampling_disabled` hide image upload; `image_rejected` asks for another file; `invalid_json` offers "try again" and manual entry. Never loop.
- Limits: at most 100 holdings; larger lists are rejected at the confirm step. Calls are concurrency-limited and batched to stay within the connector budget.

## 9. Testing

- **Unit (node:test):** every `compute/` function, with the owner's current data block as golden input and its displayed outputs as expected values; edge cases (no targets, consensus below price, single holding, zero shares, duplicate tickers across accounts).
- **Parser tests:** clean sheet, messy headers, multi-account sheet, CSV with thousands separators and currency symbols, empty sheet, image JSON with extra prose.
- **Page tests (Playwright, headless Chromium):** load `dist/index.html` with stubbed `window.claude` (`mcp`, `sample`, `downloads`): happy path, FMP-missing path, plan-denied path, bad image path, 100-row limit.
- **Post-publish checks:** confirm the published page declares the right capabilities and loads, and that the owner's real FMP connector returns the shapes the wrapper expects (one ticker). What cannot be tested from this session: the viewer's consent prompts and `sample` consent, which I will state explicitly at handover.

## 10. Out of scope (v1)

Public sharing, multi-currency, saving portfolios across sessions, transaction-level history, news/notes, non-US exchanges beyond what FMP returns, mobile-specific treemap tuning beyond the existing responsive rules.

## 11. Open items for the plan phase

1. Confirm whether `earnings-calendar` by date range covers every held symbol or truncates, and decide chunking.
2. Confirm the connector's exact display name (`FMP`) as it must appear in the manifest.
3. Check `historical-price-eod-light` depth limits for long histories on lower plans.
4. Decide the history window (since earliest `openDate`, capped at one year if the plan limits it).
