# SIF Portfolio

A small, dependency-free dashboard for the **Student Investment Fund** Schwab account:
fund value over time, **allocation and performance by theme**, a full holdings table, and a
**thesis for every position** — modelled on the manager's own portfolio app.

Plain HTML + CSS + JavaScript. No build step, no framework, no API keys.

## Run it

The page loads its data with `fetch`, so serve the folder over HTTP (opening `index.html`
straight from disk will not work):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

To host it: **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root), or any
static host (Netlify, Cloudflare Pages, Vercel) pointed at the repo root. Note that a public
repo / public Pages site exposes the fund's positions and values to anyone.

## What's on each tab

| Tab | What it shows |
|---|---|
| **Portfolio** | Fund value marked to the latest close, change since the snapshot and on the last session, YTD vs SPY, allocation by theme (click a theme for its names), last session's movers, biggest $ contributors |
| **Themes** | Every theme's value-weighted performance over 1W / 1M / 3M / since the snapshot / YTD, charted against the fund and the S&P 500; a ranked returns table (tick a theme's box to chart it, click the row for its names) |
| **Holdings** | Every position with theme, value, weight, last-day / since-snapshot / YTD return — grouped by theme or flat, sortable, filterable |
| **Theses** | The thesis for every position, with stance; filter to the ones that still need writing |

Click any ticker anywhere to open its card: price, theme, stance, a price chart, the position's
numbers and its thesis.

## How the numbers are derived — read this

The Schwab account summary lists each position's **market value only** (no share counts, no
cost basis). So each position's shares are **implied** as `value ÷ close on the snapshot date`
and carried forward unchanged:

* On the snapshot date the fund total matches the statement exactly.
* After it, the app shows **what the snapshot book would be worth if nothing had been traded.**
  Any position bought or sold since is wrong until the snapshot is updated.
* Before it (the dashed part of the line, and "YTD (backcast)") it is the same shares at earlier
  prices — not the fund's real history.
* Theme performance is value-weighted by those implied shares. Cash is held flat.

## Data files (`data/`)

| File | What | Who updates it |
|---|---|---|
| `positions.json` | The snapshot: `{symbol, name, mv, sector}` per position, plus `cashValue`, `totalValue`, `asOf` | By hand, from a new Schwab statement |
| `themes.json` | Theme → tickers. **The only place a name's theme is set.** | By hand |
| `closes.json` | Daily closes for every position + SPY/QQQ/RSP/IWM/SMH since Jan 1 | `scripts/update_prices.mjs` (automatic — see below) |
| `theses.json` | `{SYMBOL: {thesis, stance, source, updated}}` | By hand / pull request |

### Refresh prices

```bash
node scripts/update_prices.mjs      # Node 18+; Yahoo Finance daily closes, no key needed
```

The GitHub Action in `.github/workflows/prices.yml` runs this every weekday after the close and
commits the result, so a hosted copy stays current on its own. Run it on demand from the
repo's **Actions → Refresh prices → Run workflow**.

### Update the snapshot (new statement)

1. Transcribe each position's market value from the Schwab summary into `data/positions.json`
   (keep `symbol`, `name`, `mv`, `sector`), set `cashValue`, `equitiesValue`, `totalValue` and
   `asOf` to the statement date. Check the positions sum to `equitiesValue` to the cent.
2. Add any new ticker to a theme in `data/themes.json` (the Holdings tab flags unthemed names).
3. `node scripts/update_prices.mjs`, commit.

### Re-theme a name

Move its ticker from one theme's `names` list to another in `data/themes.json`. Themes marked
`"origin": "stoxtrxr"` mirror the manager's own baskets; `"sif"` themes cover the rest. Add a
theme by appending `{id, label, emoji, origin, names}`.

### Add or edit a thesis

Edit `data/theses.json` — one entry per ticker. `stance` is optional
(Accumulate · Add · Hold · Watch · Trim · Exit · Spec).

## Notes

* Prices: Yahoo Finance's public chart endpoint, split-adjusted daily closes. Spot-checked
  against Robinhood's closes on the snapshot date (identical to the cent).
* Share classes use Schwab's slash (`BRK/B`) in the data; the price script maps it to Yahoo's
  dash.
* Nothing here is investment advice.
