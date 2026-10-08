#!/usr/bin/env node
// Refresh data/closes.json: daily closes for every SIF position and benchmark,
// from Jan 1 of the snapshot year to today. Uses Yahoo Finance's public chart
// endpoint — no API key, no account. Node 18+ (built-in fetch).
//
//   node scripts/update_prices.mjs
//
// Yahoo's `close` is split-adjusted, which is what a performance chart wants.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pos = JSON.parse(fs.readFileSync(path.join(ROOT, "data/positions.json"), "utf8"));
const BENCH = ["SPY", "QQQ", "RSP", "IWM", "SMH"];

// Our symbol -> Yahoo's. Schwab writes share classes with "/", Yahoo with "-".
const yahooOf = (s) => s.replace("/", "-");
const syms = [...new Set([...pos.positions.filter((p) => p.symbol !== "CASH").map((p) => p.symbol), ...BENCH])];

const start = Math.floor(Date.parse(`${pos.asOf.slice(0, 4)}-01-01T00:00:00Z`) / 1000);
const end = Math.floor(Date.now() / 1000) + 86400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pull(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooOf(sym))}`
    + `?period1=${start}&period2=${end}&interval=1d&events=split`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.timestamp) throw new Error("no data");
      const tz = res.meta.gmtoffset || 0;
      const close = res.indicators.quote[0].close;
      const out = [];
      res.timestamp.forEach((t, i) => {
        if (close[i] == null) return;
        // Date in the exchange's own time zone, so a 4pm ET close stays on its day.
        const d = new Date((t + tz) * 1000).toISOString().slice(0, 10);
        out.push([d, Math.round(close[i] * 10000) / 10000]);
      });
      return out;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(800);
    }
  }
}

const closes = {}, failed = [];
for (const s of syms) {
  try { closes[s] = await pull(s); }
  catch (e) { failed.push(`${s} (${e.message})`); }
  await sleep(150);
}
const last = Object.values(closes).flatMap((a) => a.slice(-1).map((x) => x[0])).sort().pop();
fs.writeFileSync(path.join(ROOT, "data/closes.json"), JSON.stringify({ asOf: last, source: "Yahoo Finance daily close (split-adjusted)", benchmarks: BENCH, closes }));
console.log(`closes.json: ${Object.keys(closes).length}/${syms.length} symbols, latest ${last}`);
if (failed.length) console.log(`no data (kept at their snapshot value in the app): ${failed.join(", ")}`);
