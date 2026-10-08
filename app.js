// SIF Portfolio — everything is computed in the browser from four files in data/:
//   positions.json  the Schwab snapshot (market value per name + cash, as of `asOf`)
//   themes.json     theme -> tickers (the ONLY place a name's theme is set)
//   closes.json     daily closes for every name + benchmarks (scripts/update_prices.mjs)
//   theses.json     one thesis per ticker
//
// The snapshot has dollar values but no share counts, so each position's shares are
// IMPLIED as value / close on the snapshot date and carried forward. The fund line is
// therefore "the snapshot book, held untouched": exact on the snapshot date, wrong for
// any name traded since. Before the snapshot it is a backcast (the same shares, earlier
// prices) and is drawn dashed.
(function () {
  "use strict";
  const $ = (s) => document.getElementById(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const usd = (n, d = 0) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const usdK = (n) => Math.abs(n) >= 1e6 ? (n < 0 ? "−" : "") + "$" + (Math.abs(n) / 1e6).toFixed(2) + "M" : Math.abs(n) >= 1e4 ? (n < 0 ? "−" : "") + "$" + (Math.abs(n) / 1e3).toFixed(1) + "k" : usd(n);
  const pct = (n, d = 1) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const cls = (n) => (n == null || !isFinite(n) ? "flat" : n > 0.0001 ? "pos" : n < -0.0001 ? "neg" : "flat");
  const fmtDate = (d, opt) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", opt || { month: "short", day: "numeric", year: "numeric" });
  const SLOTS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const MAX_THEMES_ON_CHART = 6;

  let POS, THEMES, CL, TH, DAYS, P, SNAP, LAST, SH = {}, THEME_OF = {}, ROWS = [], FUND, TV = {}, BENCH;
  const state = { tf: "snap", onChart: [], slotOf: {}, open: {}, hsort: { k: "now", dir: -1 }, group: "theme", hq: "", tq: "", tf2: "all", tcTf: "ytd" };

  Promise.all(["positions", "themes", "closes", "theses"].map((n) => fetch(`data/${n}.json?t=${Date.now()}`).then((r) => {
    if (!r.ok) throw new Error(`data/${n}.json: HTTP ${r.status}`);
    return r.json();
  }))).then(([pos, th, cl, tz]) => {
    POS = pos; THEMES = th.themes; CL = cl; TH = (tz && tz.theses) || {};
    build();
    $("loading").remove();
    renderAll();
  }).catch((e) => {
    $("loading").innerHTML = `Could not load the data files (${esc(e.message)}). Serve this folder over HTTP — e.g. <code>python3 -m http.server</code> — rather than opening index.html directly.`;
  });

  // ---------------------------------------------------------------- model
  function build() {
    BENCH = CL.benchmarks || ["SPY"];
    const spine = CL.closes.SPY || Object.values(CL.closes)[0];
    DAYS = spine.map((x) => x[0]);
    const idx = new Map(DAYS.map((d, i) => [d, i]));
    P = {};
    for (const [s, arr] of Object.entries(CL.closes)) {
      const a = new Array(DAYS.length).fill(null);
      for (const [d, c] of arr) if (idx.has(d)) a[idx.get(d)] = c;
      // forward-fill a missing day (holiday on a foreign listing, a halted name)
      for (let i = 1; i < a.length; i++) if (a[i] == null) a[i] = a[i - 1];
      const first = a.findIndex((v) => v != null);
      for (let i = 0; i < first; i++) a[i] = a[first];
      P[s] = a;
    }
    SNAP = DAYS.reduce((k, d, i) => (d <= POS.asOf ? i : k), 0);
    LAST = DAYS.length - 1;
    for (const t of THEMES) for (const s of t.names) THEME_OF[s] = t.id;
    ROWS = POS.positions.map((p) => {
      const pr = P[p.symbol];
      const p0 = pr && pr[SNAP];
      const sh = p0 ? p.mv / p0 : null;
      SH[p.symbol] = sh;
      return { ...p, theme: THEME_OF[p.symbol] || null, sh, p0 };
    });
    const valAt = (r, i) => (r.sh != null ? r.sh * P[r.symbol][i] : r.mv);
    FUND = DAYS.map((_, i) => ROWS.reduce((a, r) => a + valAt(r, i), 0) + POS.cashValue);
    for (const t of THEMES) TV[t.id] = DAYS.map((_, i) => ROWS.filter((r) => r.theme === t.id).reduce((a, r) => a + valAt(r, i), 0));
    for (const r of ROWS) {
      r.now = valAt(r, LAST);
      r.prev = valAt(r, LAST - 1);
      r.day = r.sh != null ? (P[r.symbol][LAST] / P[r.symbol][LAST - 1] - 1) * 100 : null;
      r.since = r.sh != null ? (P[r.symbol][LAST] / r.p0 - 1) * 100 : null;
      r.ytd = r.sh != null ? (P[r.symbol][LAST] / P[r.symbol][0] - 1) * 100 : null;
      r.pnl = r.now - r.mv;
      r.price = P[r.symbol] ? P[r.symbol][LAST] : null;
    }
    // default chart: the five heaviest themes
    state.onChart = THEMES.map((t) => t.id).filter((id) => TV[id][LAST] > 0)
      .sort((a, b) => TV[b][LAST] - TV[a][LAST]).slice(0, 5);
    state.onChart.forEach((id, i) => (state.slotOf[id] = SLOTS[i]));
  }
  const total = () => FUND[LAST];
  const themeById = (id) => THEMES.find((t) => t.id === id);
  const themeLabel = (id) => { const t = themeById(id); return t ? `${t.emoji} ${t.label}` : "Unthemed"; };
  const startIdx = (tf) => ({ "1w": Math.max(0, LAST - 5), "1m": Math.max(0, LAST - 21), "3m": Math.max(0, LAST - 63), snap: SNAP, ytd: 0 }[tf]);
  const TF = [["1w", "1W"], ["1m", "1M"], ["3m", "3M"], ["snap", "Since snapshot"], ["ytd", "YTD"]];

  // ---------------------------------------------------------------- line chart
  // series: [{label, color, dash, width, values}] aligned to `dates`; hover = crosshair + tooltip.
  function lineChart(el, dates, series, o = {}) {
    const W = o.w || 900, H = o.h || 320, L = o.left ?? 46, R = o.right ?? 12, T = 10, B = o.bottom ?? 24;
    const all = series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (o.base != null) { lo = Math.min(lo, o.base); hi = Math.max(hi, o.base); }
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const n = dates.length;
    const x = (i) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const fmt = o.fmt || ((v) => v.toFixed(0));
    let g = "";
    const ticks = 4;
    for (let k = 0; k <= ticks; k++) {
      const v = lo + ((hi - lo) * k) / ticks;
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line-2)"/>`;
      if (!o.noAxis) g += `<text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)">${esc(fmt(v))}</text>`;
    }
    if (o.base != null) g += `<line x1="${L}" x2="${W - R}" y1="${y(o.base).toFixed(1)}" y2="${y(o.base).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
    if (o.marker != null && o.marker > 0 && o.marker < n) {
      g += `<line x1="${x(o.marker).toFixed(1)}" x2="${x(o.marker).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3"/>`
        + `<text x="${(x(o.marker) + 4).toFixed(1)}" y="${T + 10}" font-size="10.5" fill="var(--muted)">${esc(o.markerLabel || "")}</text>`;
    }
    if (!o.noAxis) {
      const lab = (i, a) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${a}" font-size="11" fill="var(--muted)">${esc(fmtDate(dates[i], { month: "short", day: "numeric" }))}</text>`;
      g += lab(0, "start") + lab(n - 1, "end");
      if (n > 40) g += lab(Math.round((n - 1) / 2), "middle");
    }
    const path = (vals, from, to) => {
      let d = "", pen = false;
      for (let i = from; i <= to; i++) { const v = vals[i]; if (v == null || !isFinite(v)) { pen = false; continue; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }
      return d;
    };
    for (const s of series) {
      const w = s.width || 2;
      if (s.splitAt != null && s.splitAt > 0) {
        g += `<path d="${path(s.values, 0, s.splitAt)}" fill="none" stroke="${s.color}" stroke-width="${w}" stroke-dasharray="4 4" opacity=".55" stroke-linejoin="round" stroke-linecap="round"/>`;
        g += `<path d="${path(s.values, s.splitAt, n - 1)}" fill="none" stroke="${s.color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
      } else {
        g += `<path d="${path(s.values, 0, n - 1)}" fill="none" stroke="${s.color}" stroke-width="${w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
      }
    }
    // end-of-line direct labels when few series
    if (o.directLabels && series.length <= 4) {
      for (const s of series) { const v = s.values[n - 1]; if (v != null) g += `<text x="${W - R + 4}" y="${(y(v) + 4).toFixed(1)}" font-size="11" fill="var(--ink-2)">${esc(s.short || s.label)}</text>`; }
    }
    g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink-2)" stroke-width="1" visibility="hidden"/>`;
    g += `<g class="dots"></g><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "chart")}">${g}</svg>`;
    if (o.noHover) return;
    const svg = el.querySelector("svg"), xh = svg.querySelector(".xh"), dots = svg.querySelector(".dots");
    let tip = el.querySelector(".tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; el.appendChild(tip); }
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
      xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
      dots.innerHTML = series.map((s) => s.values[i] == null ? "" : `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join("");
      const rows = series.map((s) => ({ s, v: s.values[i] })).filter((z) => z.v != null).sort((a, b) => b.v - a.v);
      tip.innerHTML = `<div class="d">${esc(fmtDate(dates[i]))}</div>` + rows.map((z) =>
        `<div class="r"><i style="background:${z.s.color}"></i><span>${esc(z.s.label)}</span><b>${esc((o.tipFmt || fmt)(z.v))}</b></div>`).join("");
      tip.hidden = false;
      const er = el.getBoundingClientRect();
      const left = ev.clientX - er.left + 14, tw = tip.offsetWidth;
      tip.style.left = (left + tw > er.width ? left - tw - 28 : left) + "px";
      tip.style.top = Math.max(0, ev.clientY - er.top - 20) + "px";
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerleave", () => { xh.setAttribute("visibility", "hidden"); dots.innerHTML = ""; tip.hidden = true; });
  }

  // ---------------------------------------------------------------- portfolio tab
  function renderPortfolio() {
    const T = total(), T0 = POS.totalValue, dSnap = T - T0, rSnap = (T / T0 - 1) * 100;
    const dDay = FUND[LAST] - FUND[LAST - 1], rDay = (FUND[LAST] / FUND[LAST - 1] - 1) * 100;
    $("heroSub").textContent = `· marked to the ${fmtDate(DAYS[LAST])} close`;
    $("heroV").textContent = usd(T, 2);
    $("heroD").innerHTML = `<span class="${cls(dSnap)}">${dSnap >= 0 ? "▲" : "▼"} ${usd(Math.abs(dSnap), 2)} (${pct(rSnap, 2)}) since the ${esc(fmtDate(POS.asOf))} snapshot</span>`
      + ` <span class="hint">· last session <span class="${cls(dDay)}">${pct(rDay, 2)}</span></span>`;
    lineChart($("heroSpark"), DAYS, [{ label: "Fund", color: css("--ink"), values: FUND, splitAt: SNAP }],
      { w: 520, h: 120, left: 4, right: 4, bottom: 4, noAxis: true, marker: SNAP, markerLabel: "snapshot", fmt: (v) => usdK(v), tipFmt: (v) => usd(v), aria: "Fund value" });
    $("caveat").innerHTML = `Values are the <b>${esc(fmtDate(POS.asOf))}</b> Schwab snapshot held untouched: shares are implied from each name's close that day, so anything traded since is off. `
      + `The dashed part of the line before the snapshot is a backcast (same shares, earlier prices), not the fund's actual history.`;

    const spy = P.SPY ? (P.SPY[LAST] / P.SPY[SNAP] - 1) * 100 : null;
    const eq = T - POS.cashValue;
    const nTh = ROWS.filter((r) => TH[r.symbol] && TH[r.symbol].thesis).length;
    const ytd = (FUND[LAST] / FUND[0] - 1) * 100;
    $("cards").innerHTML = [
      ["EQUITIES", usd(eq), `${ROWS.length} positions · ${THEMES.filter((t) => TV[t.id][LAST] > 0).length} themes`],
      ["CASH", usd(POS.cashValue), `${((POS.cashValue / T) * 100).toFixed(1)}% of fund · as of snapshot`],
      ["SINCE SNAPSHOT", `<span class="${cls(rSnap)}">${pct(rSnap, 2)}</span>`, `S&P 500 (SPY) ${pct(spy, 2)} · ${rSnap - spy >= 0 ? "ahead" : "behind"} by ${Math.abs(rSnap - spy).toFixed(2)} pts`],
      ["YTD (BACKCAST)", `<span class="${cls(ytd)}">${pct(ytd, 2)}</span>`, `SPY ${pct(P.SPY ? (P.SPY[LAST] / P.SPY[0] - 1) * 100 : null, 2)} · snapshot shares held all year`],
      ["THESIS COVERAGE", `${nTh} / ${ROWS.length}`, `${ROWS.length - nTh} positions still need one`],
    ].map(([k, v, f]) => `<div class="stat"><div class="label">${k}</div><div class="v">${v}</div><div class="f">${f}</div></div>`).join("");

    // allocation by theme
    const th = THEMES.map((t) => ({ t, v: TV[t.id][LAST] })).filter((z) => z.v > 0).sort((a, b) => b.v - a.v);
    const max = th[0].v;
    $("alloc").innerHTML = th.map(({ t, v }) => {
      const open = state.open["al:" + t.id];
      const names = ROWS.filter((r) => r.theme === t.id).sort((a, b) => b.now - a.now);
      return `<div class="al-row" data-al="${t.id}"><div><div class="al-name">${esc(t.emoji)} ${esc(t.label)} <span class="sub">${names.length}</span></div>`
        + `<div class="al-track"><div class="al-fill" style="width:${((v / max) * 100).toFixed(1)}%"></div></div></div>`
        + `<div class="al-v">${usdK(v)}</div><div class="al-p">${((v / T) * 100).toFixed(1)}%</div></div>`
        + (open ? `<div class="al-members">${names.map((r) => `<span class="chip" data-sym="${esc(r.symbol)}"><b>${esc(r.symbol)}</b> ${((r.now / T) * 100).toFixed(1)}% <span class="${cls(r.since)}">${pct(r.since)}</span></span>`).join("")}</div>` : "");
    }).join("") + `<div class="al-row" style="cursor:default"><div><div class="al-name">💵 Cash</div><div class="al-track"><div class="al-fill" style="width:${((POS.cashValue / max) * 100).toFixed(1)}%;background:var(--bench)"></div></div></div><div class="al-v">${usdK(POS.cashValue)}</div><div class="al-p">${((POS.cashValue / T) * 100).toFixed(1)}%</div></div>`;

    // movers + contributors
    const live = ROWS.filter((r) => r.day != null);
    const up = [...live].sort((a, b) => b.day - a.day).slice(0, 5), dn = [...live].sort((a, b) => a.day - b.day).slice(0, 5);
    const mrow = (r, v) => `<div class="mv-row" data-sym="${esc(r.symbol)}"><span class="t">${esc(r.symbol)}</span><span class="n">${esc(r.name)}</span><span class="p ${cls(v)}">${pct(v)}</span></div>`;
    $("moversSub").textContent = fmtDate(DAYS[LAST]);
    $("movers").innerHTML = `<div class="mv-h">TOP 5 GAINERS</div>${up.map((r) => mrow(r, r.day)).join("")}<div class="mv-h">TOP 5 LOSERS</div>${dn.map((r) => mrow(r, r.day)).join("")}`;
    const crow = (r) => `<div class="mv-row" data-sym="${esc(r.symbol)}"><span class="t">${esc(r.symbol)}</span><span class="n">${esc(r.name)}</span><span class="p ${cls(r.pnl)}">${(r.pnl >= 0 ? "+" : "") + usdK(r.pnl)}</span></div>`;
    const byPnl = [...ROWS].sort((a, b) => b.pnl - a.pnl);
    $("contribSub").textContent = `$ since ${fmtDate(POS.asOf, { month: "short", day: "numeric" })}`;
    $("contrib").innerHTML = `<div class="mv-h">ADDED MOST</div>${byPnl.slice(0, 4).map(crow).join("")}<div class="mv-h">COST MOST</div>${byPnl.slice(-4).reverse().map(crow).join("")}`;
  }

  // ---------------------------------------------------------------- themes tab
  function slotColor(id) { return css(state.slotOf[id]); }
  function toggleTheme(id) {
    const on = state.onChart.indexOf(id);
    if (on >= 0) { state.onChart.splice(on, 1); delete state.slotOf[id]; }
    else {
      if (state.onChart.length >= MAX_THEMES_ON_CHART) { flash(`Up to ${MAX_THEMES_ON_CHART} themes at once — untick one first`); return; }
      const used = new Set(Object.values(state.slotOf));
      state.slotOf[id] = SLOTS.find((s) => !used.has(s));   // a theme keeps its colour while it stays on
      state.onChart.push(id);
    }
    renderThemes();
  }
  function renderThemes() {
    $("tfSeg").innerHTML = TF.map(([k, l]) => `<button data-tf="${k}" class="${state.tf === k ? "is-on" : ""}">${l}</button>`).join("");
    const s0 = startIdx(state.tf);
    $("tfNote").textContent = `${fmtDate(DAYS[s0])} → ${fmtDate(DAYS[LAST])}` + (s0 < SNAP ? " · before the snapshot is a backcast" : "");
    const dates = DAYS.slice(s0);
    const rebase = (arr) => { const b = arr[s0]; return arr.slice(s0).map((v) => (b ? (v / b) * 100 : null)); };
    const series = [
      { label: "SIF fund", short: "SIF", color: css("--ink"), width: 2.5, values: rebase(FUND) },
      { label: "S&P 500 (SPY)", short: "SPY", color: css("--bench"), dash: "5 4", values: rebase(P.SPY) },
      ...state.onChart.map((id) => ({ label: themeLabel(id), color: slotColor(id), values: rebase(TV[id]) })),
    ];
    $("legend").innerHTML = series.map((s) => `<span class="lg"><i class="${s.dash ? "dash" : ""}" style="background:${s.color};height:${s.width && s.width > 2 ? 3 : 2}px"></i>${esc(s.label)}</span>`).join("");
    lineChart($("themeChart"), dates, series, { base: 100, fmt: (v) => v.toFixed(0), tipFmt: (v) => pct(v - 100), marker: s0 < SNAP ? SNAP - s0 : null, markerLabel: "snapshot", aria: "Theme performance" });

    const T = total();
    const rows = THEMES.filter((t) => TV[t.id][LAST] > 0).map((t) => ({ t, w: (TV[t.id][LAST] / T) * 100, r: (TV[t.id][LAST] / TV[t.id][s0] - 1) * 100 }))
      .sort((a, b) => b.r - a.r);
    const fundR = (FUND[LAST] / FUND[s0] - 1) * 100, spyR = (P.SPY[LAST] / P.SPY[s0] - 1) * 100;
    const mx = Math.max(...rows.map((z) => Math.abs(z.r)), Math.abs(fundR), Math.abs(spyR), 1);
    const bar = (r) => { const w = (Math.abs(r) / mx) * 50; return `<div class="rbar"><span style="${r >= 0 ? `left:50%;width:${w}%;background:var(--pos)` : `left:${50 - w}%;width:${w}%;background:var(--neg)`}"></span><i class="mid"></i></div>`; };
    $("trSub").textContent = `${TF.find((z) => z[0] === state.tf)[1]} · fund ${pct(fundR, 2)} vs SPY ${pct(spyR, 2)}`;
    $("themeTable").innerHTML = `<tr><th>THEME</th><th class="r">NAMES</th><th class="r">WEIGHT</th><th class="r">RETURN</th><th style="width:30%"></th></tr>`
      + rows.map(({ t, w, r }) => {
        const on = state.onChart.includes(t.id), open = state.open["th:" + t.id];
        const names = ROWS.filter((x) => x.theme === t.id).map((x) => ({ x, r: x.sh != null ? (P[x.symbol][LAST] / P[x.symbol][s0] - 1) * 100 : null })).sort((a, b) => (b.r ?? -1e9) - (a.r ?? -1e9));
        return `<tr class="row ${on ? "on" : ""}" data-th="${t.id}"><td><span class="sw" data-toggle="${t.id}" title="${on ? "Remove from" : "Add to"} the chart" style="${on ? `background:${slotColor(t.id)}` : ""}"></span>${esc(t.emoji)} ${esc(t.label)}${t.origin === "stoxtrxr" ? ' <span class="sub">manager theme</span>' : ""}</td>`
          + `<td class="r">${names.length}</td><td class="r">${w.toFixed(1)}%</td><td class="r ${cls(r)}"><b>${pct(r, 2)}</b></td><td>${bar(r)}</td></tr>`
          + (open ? `<tr><td colspan="5"><div class="al-members">${names.map(({ x, r }) => `<span class="chip" data-sym="${esc(x.symbol)}"><b>${esc(x.symbol)}</b> <span class="${cls(r)}">${pct(r)}</span></span>`).join("")}</div></td></tr>` : "");
      }).join("")
      + `<tr><td><b>SIF fund</b></td><td class="r">${ROWS.length}</td><td class="r">100%</td><td class="r ${cls(fundR)}"><b>${pct(fundR, 2)}</b></td><td>${bar(fundR)}</td></tr>`
      + `<tr><td>S&amp;P 500 (SPY)</td><td></td><td></td><td class="r ${cls(spyR)}">${pct(spyR, 2)}</td><td>${bar(spyR)}</td></tr>`;
  }

  // ---------------------------------------------------------------- holdings tab
  const HCOLS = [["symbol", "POSITION", ""], ["theme", "THEME", ""], ["now", "VALUE", "r"], ["w", "WEIGHT", "r"], ["day", "LAST DAY", "r"], ["since", "SINCE SNAPSHOT", "r"], ["ytd", "YTD", "r"]];
  function renderHoldings() {
    const T = total(), q = state.hq.toLowerCase();
    const rows = ROWS.map((r) => ({ ...r, w: (r.now / T) * 100 })).filter((r) => !q || r.symbol.toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q) || themeLabel(r.theme).toLowerCase().includes(q));
    const { k, dir } = state.hsort;
    const sorter = (a, b) => { const A = a[k], B = b[k]; if (A == null) return 1; if (B == null) return -1; return (typeof A === "string" ? A.localeCompare(B) : A - B) * dir; };
    const line = (r) => `<tr class="row" data-sym="${esc(r.symbol)}"><td><b>${esc(r.symbol)}</b> <span class="co">${esc(r.name)}</span></td><td>${esc(themeLabel(r.theme))}</td>`
      + `<td class="r">${usd(r.now)}</td><td class="r">${r.w.toFixed(2)}%</td><td class="r ${cls(r.day)}">${pct(r.day)}</td><td class="r ${cls(r.since)}">${pct(r.since)}</td><td class="r ${cls(r.ytd)}">${pct(r.ytd)}</td></tr>`;
    let body = "";
    if (state.group === "theme") {
      const groups = THEMES.map((t) => ({ t, rows: rows.filter((r) => r.theme === t.id).sort(sorter) })).filter((g) => g.rows.length)
        .sort((a, b) => b.rows.reduce((s, r) => s + r.now, 0) - a.rows.reduce((s, r) => s + r.now, 0));
      const loose = rows.filter((r) => !r.theme);
      if (loose.length) groups.push({ t: { id: "_none", emoji: "⚠️", label: "Not in any theme — add to data/themes.json" }, rows: loose });
      body = groups.map(({ t, rows }) => {
        const v = rows.reduce((s, r) => s + r.now, 0), v0 = rows.reduce((s, r) => s + r.mv, 0), collapsed = state.open["hg:" + t.id] === false;
        return `<tr class="grp" data-hg="${t.id}"><td>${collapsed ? "▸" : "▾"} ${esc(t.emoji)} ${esc(t.label)} <span class="sub">${rows.length}</span></td><td></td><td class="r">${usd(v)}</td><td class="r">${((v / T) * 100).toFixed(1)}%</td><td></td><td class="r ${cls(v / v0 - 1)}">${pct((v / v0 - 1) * 100)}</td><td></td></tr>`
          + (collapsed ? "" : rows.map(line).join(""));
      }).join("");
    } else body = rows.sort(sorter).map(line).join("");
    $("holdTable").innerHTML = `<tr>${HCOLS.map(([kk, l, c]) => `<th class="${c}" data-sort="${kk}">${l}${k === kk ? (dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr>` + body
      + `<tr><td><b>Cash</b></td><td></td><td class="r">${usd(POS.cashValue)}</td><td class="r">${((POS.cashValue / T) * 100).toFixed(2)}%</td><td></td><td></td><td></td></tr>`;
  }

  // ---------------------------------------------------------------- theses tab
  function renderTheses() {
    const T = total(), q = state.tq.toLowerCase();
    const list = [...ROWS].sort((a, b) => b.now - a.now).filter((r) => {
      const t = TH[r.symbol], has = !!(t && t.thesis);
      if (state.tf2 === "has" && !has) return false;
      if (state.tf2 === "needs" && has) return false;
      return !q || r.symbol.toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q) || (has && t.thesis.toLowerCase().includes(q));
    });
    $("thCount").textContent = `${list.length} of ${ROWS.length}`;
    $("thesisList").innerHTML = list.map((r) => {
      const t = TH[r.symbol];
      return `<div class="th-item" data-sym="${esc(r.symbol)}"><div class="h"><span class="s">${esc(r.symbol)}</span><span class="n">${esc(r.name)}</span><span class="w">${((r.now / T) * 100).toFixed(1)}%</span></div>`
        + `<div class="hint" style="font-size:12px;margin-top:2px">${esc(themeLabel(r.theme))}${t && t.stance ? ` · <b>${esc(t.stance)}</b>` : ""}</div>`
        + (t && t.thesis ? `<div class="x">${esc(t.thesis)}</div>` : `<div class="x none">No thesis yet.</div>`) + `</div>`;
    }).join("");
  }

  // ---------------------------------------------------------------- ticker card
  function openCard(sym) {
    const r = ROWS.find((x) => x.symbol === sym); if (!r) return;
    const T = total(), t = TH[sym];
    state.cardSym = sym;
    $("tcSym").textContent = sym;
    $("tcName").textContent = r.name;
    $("tcMeta").innerHTML = r.price != null
      ? `<b>${usd(r.price, 2)}</b> · <span class="${cls(r.day)}">${pct(r.day, 2)}</span> on ${esc(fmtDate(DAYS[LAST], { month: "short", day: "numeric" }))}`
      : `<span class="hint">No price feed for this name — held at its snapshot value.</span>`;
    $("tcTags").innerHTML = `<span class="tag">${esc(themeLabel(r.theme))}</span>${t && t.stance ? `<span class="tag stance">${esc(t.stance)}</span>` : ""}`;
    $("tcFacts").innerHTML = [
      ["VALUE NOW", usd(r.now)], ["WEIGHT", ((r.now / T) * 100).toFixed(2) + "%"], ["SINCE SNAPSHOT", `<span class="${cls(r.since)}">${pct(r.since)}</span>`],
      ["AT SNAPSHOT", usd(r.mv)], ["IMPLIED SHARES", r.sh != null ? r.sh.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"], ["YTD", `<span class="${cls(r.ytd)}">${pct(r.ytd)}</span>`],
    ].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
    $("tcThesis").innerHTML = t && t.thesis
      ? `<div class="tc-thesis">${esc(t.thesis)}</div><div class="tc-src">${esc(t.source || "")}${t.updated ? ` · ${esc(t.updated)}` : ""}</div>`
      : `<div class="tc-thesis none">No thesis yet — add one to <code>data/theses.json</code>.</div>`;
    $("modal").hidden = false;
    renderCardChart();
  }
  function renderCardChart() {
    const sym = state.cardSym, pr = P[sym];
    const tfs = [["1m", "1M"], ["3m", "3M"], ["snap", "Since snapshot"], ["ytd", "YTD"]];
    $("tcTf").innerHTML = tfs.map(([k, l]) => `<button data-ctf="${k}" class="${state.tcTf === k ? "is-on" : ""}">${l}</button>`).join("");
    if (!pr) { $("tcChart").innerHTML = `<p class="hint">No price history.</p>`; return; }
    const s0 = startIdx(state.tcTf), vals = pr.slice(s0), ch = (vals[vals.length - 1] / vals[0] - 1) * 100;
    $("tcChart").innerHTML = "";
    const cap = document.createElement("div"); cap.className = "cap";
    cap.innerHTML = `${esc(sym)} · ${esc(tfs.find((z) => z[0] === state.tcTf)[1])} <b class="${cls(ch)}">${pct(ch)}</b> · ${usd(vals[0], 2)} → ${usd(vals[vals.length - 1], 2)}`;
    const box = document.createElement("div"); box.className = "chart";
    $("tcChart").append(cap, box);
    lineChart(box, DAYS.slice(s0), [{ label: sym, color: css(ch >= 0 ? "--pos" : "--neg"), values: vals }],
      { w: 420, h: 170, left: 48, fmt: (v) => usd(v, v < 10 ? 2 : 0), tipFmt: (v) => usd(v, 2), marker: s0 < SNAP ? SNAP - s0 : null, markerLabel: "snapshot", aria: `${sym} price` });
  }

  // ---------------------------------------------------------------- wiring
  function renderAll() {
    renderPortfolio(); renderThemes(); renderHoldings(); renderTheses();
    $("foot").innerHTML = `Snapshot: ${esc(POS.source)}, ${esc(fmtDate(POS.asOf))} — ${usd(POS.totalValue, 2)} (equities ${usd(POS.equitiesValue, 2)} + cash ${usd(POS.cashValue, 2)}). `
      + `Prices: ${esc(CL.source || "daily closes")} through ${esc(fmtDate(CL.asOf || DAYS[LAST]))}. Themes: data/themes.json. Not investment advice.`;
  }
  let flashT;
  function flash(msg) { $("tfNote").textContent = msg; clearTimeout(flashT); flashT = setTimeout(renderThemes, 2200); }

  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab"); if (!b) return;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("is-active", x === b));
    document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== "pane-" + b.dataset.tab));
  });
  document.addEventListener("click", (e) => {
    const sym = e.target.closest("[data-sym]");
    if (sym) { openCard(sym.dataset.sym); return; }
    if (e.target.closest("[data-close]")) { $("modal").hidden = true; return; }
    const al = e.target.closest("[data-al]");
    if (al) { state.open["al:" + al.dataset.al] = !state.open["al:" + al.dataset.al]; renderPortfolio(); return; }
    const tg = e.target.closest("[data-toggle]");
    if (tg) { toggleTheme(tg.dataset.toggle); return; }
    const th = e.target.closest("[data-th]");
    if (th) { state.open["th:" + th.dataset.th] = !state.open["th:" + th.dataset.th]; renderThemes(); return; }
    const tf = e.target.closest("[data-tf]");
    if (tf) { state.tf = tf.dataset.tf; renderThemes(); return; }
    const ctf = e.target.closest("[data-ctf]");
    if (ctf) { state.tcTf = ctf.dataset.ctf; renderCardChart(); return; }
    const so = e.target.closest("[data-sort]");
    if (so) { const k = so.dataset.sort; state.hsort = { k, dir: state.hsort.k === k ? -state.hsort.dir : (k === "symbol" || k === "theme" ? 1 : -1) }; renderHoldings(); return; }
    const hg = e.target.closest("[data-hg]");
    if (hg) { const k = "hg:" + hg.dataset.hg; state.open[k] = state.open[k] === false ? true : false; renderHoldings(); return; }
    const g = e.target.closest("[data-g]");
    if (g) { state.group = g.dataset.g; document.querySelectorAll("#groupSeg button").forEach((x) => x.classList.toggle("is-on", x === g)); renderHoldings(); return; }
    const f = e.target.closest("[data-f]");
    if (f) { state.tf2 = f.dataset.f; document.querySelectorAll("#thSeg button").forEach((x) => x.classList.toggle("is-on", x === f)); renderTheses(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("modal").hidden = true; });
  $("hq").addEventListener("input", (e) => { state.hq = e.target.value; renderHoldings(); });
  $("tq").addEventListener("input", (e) => { state.tq = e.target.value; renderTheses(); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => POS && renderAll());
})();
