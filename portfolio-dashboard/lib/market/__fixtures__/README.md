# Recorded market-data fixtures

Recorded 2026-11-04 (public market data, no personal data). Used only by the pure parsers in `lib/market/`.
Do not "refresh" them casually: the golden values in the tests are taken from these files.

| File | Source URL | Notes |
| --- | --- | --- |
| `stockanalysis-forecast-nvda.md` | https://stockanalysis.com/stocks/nvda/forecast/ | Firecrawl `scrape`, `formats: ["markdown"]`. Trimmed: the lower Financial/Revenue/EPS forecast tables were cut; headline sentence, Price Target table, Recommendation Trends and Latest Forecasts (5 rows) are verbatim. |
| `stockanalysis-ratings-nvda.md` | https://stockanalysis.com/stocks/nvda/ratings/ | Firecrawl `scrape`, `onlyMainContent: true`. Verbatim. Free page lists only the 8 latest calls. |
| `stockanalysis-forecast-mram.md` | https://stockanalysis.com/stocks/mram/forecast/ | Thin coverage (4 analysts). Same trimming as NVDA. |
| `nasdaq-targetprice-nvda.json` | https://api.nasdaq.com/api/analyst/NVDA/targetprice | Verbatim (Zacks consensus). |
| `nasdaq-earnings-date-nvda.json` | https://api.nasdaq.com/api/analyst/NVDA/earnings-date | Verbatim. |
| `nasdaq-earnings-date-mram-nodate.json` | https://api.nasdaq.com/api/analyst/MRAM/earnings-date | Verbatim; "vendor hasn't provided date" case. |
| `nasdaq-earnings-surprise-nvda.json` | https://api.nasdaq.com/api/company/NVDA/earnings-surprise | Verbatim. |
| `yahoo-chart-nvda.json` | https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=1y&interval=1d | Verbatim, NOT trimmed (29 KB, 252 bars). The last bar is the intraday bar of the recording day. |

Nasdaq and Yahoo were fetched with plain `curl` and a generic browser User-Agent.
StockAnalysis was fetched through the Firecrawl API (1 credit per page, `proxyUsed: basic`).

Shapes are described in `docs/superpowers/notes/data-sources.md`.
