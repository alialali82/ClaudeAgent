# Market data sources: probe findings (recorded 2026-11-04)

None of these are licensed APIs. Parsers must return null/empty on any layout change.

## StockAnalysis (through Firecrawl `scrape`, markdown)

Cost: `creditsUsed: 1` per page (forecast, ratings, MRAM all 1; `cacheState: hit` so responses can be up to hours old; pass `maxAge: 0` for a live fetch). Direct requests from cloud IPs are 403.

`/stocks/<t>/forecast/` contains
- headline: `According to 62 analysts polled by S&P Global, ... an average price target of $327.14 ...` (n = analyst count)
- table `| Target | Low | Average | Median | High |` with row `| Price | $180 | $327.14 | $315 | $515 |` (then a `Change` row)
- "Recommendation Trends" table (Strong Buy / Buy / Hold / Sell / Strong Sell / Total by month, last column = current)
- "Latest Forecasts" table with only the **5 latest** calls
- the plain-HTML number formats vary: `$25.5` (no trailing zero), `$180`, `$327.14`.

`/stocks/<t>/ratings/` ("Ratings History", free tier) has the identical column layout
`| Analyst | Firm | Rating | Rating | Action | Price Target | Upside | Date |` but only the **8 latest** rows (NVDA: Oct 20 to Nov 3, about two weeks). Longer history is Pro-only ("Up to 3 years of analyst rating history"). So neither page reaches 60-90 days for a heavily covered name; the ratings page is strictly better (8 > 5) and costs the same 1 credit. The parser accepts either page (it finds the table by its header), so 11b may scrape both and merge/dedupe. Thin names (MRAM) show everything on the forecast page (3 rows, one older than 90 days).

Rows: column 0 is `[Name](url)<br>Firm`; use the `Firm` column. Price Target is `$300` or `n/a` (rows with `n/a` must be skipped). The "Rating" cell is `Buy<br>Maintains<br>$275`. A revised target is expected as `$285 → $345` (not seen in the recorded pages; parser takes the last amount). Date format `Nov 3, 2026`. Names may contain zero-width characters.

Thin coverage (MRAM): headline says `According to 4 analysts`, otherwise identical layout. The "No. Analysts" row in the Financial Forecast table is a different (EPS) count (4 for MRAM, 54 for NVDA while the headline said 62), so n comes from the headline.

Note: the live NVDA numbers (avg 327.14, n 62) differ from the figures quoted in the task brief (328.72, n 61); the page changes daily. Tests use the recorded fixture values.

## Nasdaq (direct, `Accept: application/json`, browser UA) - all 200

- `/api/analyst/<T>/targetprice`: `data.consensusOverview = { lowPriceTarget, highPriceTarget, priceTarget (mean), buy, sell, hold }` as JSON numbers. NO analyst count field (buy+hold+sell exists, 33 for NVDA, but it is a rating count and is not used as `n`). Also `historicalConsensus` monthly series. NVDA: low 275, high 465, mean 322.5. Unknown symbol: HTTP 200 with `data: null`, `status.rCode: 400`, `bCodeMessage[0].errorMessage "Symbol not exists."`.
- `/api/analyst/<T>/earnings-date`: `data.reportText` e.g. `"NVIDIA ... is expected* to report earnings on  11/17/2026 after market close.  The report will be for the fiscal Quarter ending Oct 2026. ..."`, `data.announcement` = `"Earnings announcement* for NVDA: Nov 17, 2026"`. There is NO structured date field and NO confirmed flag; the asterisk means "expected" (Zacks estimate). So `conf` is `false` unless the text contains the word "confirmed" (never seen). The fiscal quarter is given only as a month/year ("Quarter ending Oct 2026"), not Q1-Q4, so `what` is e.g. `"Oct 2026 quarter results"`. No date known (MRAM): `reportText` = "Our vendor, Zacks Investment Research, hasn't provided us with the upcoming earnings report date." and `announcement` ends with empty value. Time of day is only in free text ("after market close").
- `/api/company/<T>/earnings-surprise`: `data.earningsSurpriseTable.rows[] = { fiscalQtrEnd "Jul 2026", dateReported "8/26/2026" (M/D/YYYY), eps number, consensusForecast "2.09" (string), percentageSurprise "6.22" (string) }`, 4 rows, most recent first. Also `data.chart` (epoch strings + surprise, ignored).

## Yahoo chart (direct, browser UA)

`/v8/finance/chart/NVDA?range=1y&interval=1d` gives `chart.result[0]` with `meta` (`symbol, longName, shortName, regularMarketPrice, chartPreviousClose, gmtoffset (-18000 EST), timezone, exchangeTimezoneName`), `timestamp[]` (epoch seconds, bar start = market open, 14:30 UTC = 09:30 EST) and `indicators.quote[0].{open,high,low,close,volume}` plus `indicators.adjclose[0].adjclose`. 252 bars for 1y, 29 KB. `close` may contain `null`s. IMPORTANT: when recorded during the session the last bar is today's partial bar (close equals `regularMarketPrice`), and `meta.chartPreviousClose` is the close before the START of the range, not the previous day, hence prevClose = second to last close. Unknown symbol: HTTP 200? body `{"chart":{"result":null,"error":{"code":"Not Found","description":"No data found, symbol may be delisted"}}}`.

## Dates and calendars

Yahoo bar dates must be converted to exchange-local with `gmtoffset` (a bar at 14:30 UTC is the same day anyway, but a timestamp just after local midnight in a UTC+ market would be the previous UTC day).
