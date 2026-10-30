# Fixtures

## market-2026-10-07.json

Public market data (prices, analyst consensus, targets, events, betas) as of
2026-10-07, taken from the owner's reference dashboard. Shape:
`{ asof, prevAsof, tickers }`, with each ticker object preserved exactly as in
the reference data (the free-text `note` field is removed).

Positions, history, benchmark data and notes are deliberately absent.

Regenerating this file requires the owner's reference dashboard file, so do not
regenerate it casually.
