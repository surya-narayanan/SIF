# SIF — Sector Exposure Analysis

Static sector-exposure analysis for the SIF (Student Investment Fund) Charles Schwab
brokerage account. **Not a linked account** — there is no live sync; the data is a
manual snapshot transcribed from a Schwab account-summary PDF.

## Contents
- `data/holdings.json` — snapshot: 94 positions, each `{symbol, name, mv, sector}`,
  reconciled exactly to the statement total.
- `index.html` — self-contained page (data inlined): sector-allocation bars +
  sortable, sector-filterable holdings table. Open directly in a browser.

## Current snapshot
- Source: Charles Schwab — Corporate brokerage (…159)
- As of: 2026-06-02
- Total value: $1,966,716.04  (invested $1,917,156.45 + cash $49,559.59)

## Updating
Paste a fresh Schwab account-summary PDF; re-transcribe positions into
`data/holdings.json` (keep the `sector` field), then re-inline into `index.html`.

## Sectors
GICS-style, with **Semiconductors** broken out of Information Technology (the book
is chip-heavy) and payment networks (V) grouped under Financials per current GICS.
