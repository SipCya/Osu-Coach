import { Bin, cheatVerdict, Flag, FrametimeReport, histogram, Snap } from "./cheat-check";

export interface CheatReportData {
  player: string;
  title: string;
  ur: number;
  meanError: number;
  offsets: number[];
  holdDurations: number[];
  leftHolds: number[];
  rightHolds: number[];
  frametime: FrametimeReport;
  snaps: Snap[];
  maxCursorSpeed: number;
  flags: Flag[];
}

const ACCENT = "#ff66aa";
const SUSPECT = "#ff5c5c";
const SEVERITY_COLOR: Record<string, string> = { high: "#ff5c5c", medium: "#ffb347", low: "#ffd166" };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function timestamp(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Nice rounded step for axis ticks (1/2/5 × 10ⁿ). */
function niceStep(roughMax: number, targetTicks: number): number {
  const raw = Math.max(1, roughMax) / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Interactive bar chart over numeric bins: hover tooltip, X labels, a Y axis with gridlines, and a mean line. */
function barChart(bins: Bin[], opts: { mean?: number; unit: string; color?: string; suspect?: (b: Bin) => boolean }): string {
  if (bins.length === 0 || bins.every((b) => b.count === 0)) return `<p class="muted">No data.</p>`;
  const color = opts.color ?? ACCENT;
  const W = 680;
  const H = 240;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 24;
  const padBottom = 34;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const max = Math.max(1, ...bins.map((b) => b.count));
  const min = bins[0].from;
  const maxV = bins[bins.length - 1].to;
  const range = maxV - min || 1;
  const bw = plotW / bins.length;

  // Y axis: gridlines + count labels at nice steps (counts are integers → step ≥ 1).
  const yStep = Math.max(1, niceStep(max, 4));
  const yGrid: string[] = [];
  for (let v = 0; v <= max + 1e-9; v += yStep) {
    const y = H - padBottom - (v / max) * plotH;
    yGrid.push(
      `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${W - padRight}" y2="${y.toFixed(1)}" class="gridline" />` +
        `<text x="${padLeft - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="axis">${v}</text>`,
    );
  }

  const rects = bins
    .map((b, i) => {
      const h = (b.count / max) * plotH;
      const x = padLeft + i * bw;
      const y = H - padBottom - h;
      const flagged = opts.suspect?.(b) ?? false;
      const tip = `${fmtNum(b.from)}..${fmtNum(b.to)} ${opts.unit} — ${b.count}${flagged ? " ⚠️ suspicious" : ""}`;
      return `<rect class="bar" data-tip="${esc(tip)}" x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(
        1,
        bw - 2,
      ).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${flagged ? SUSPECT : color}"></rect>`;
    })
    .join("");

  // X labels: one per bar when they fit, otherwise skip some.
  const labelEvery = Math.max(1, Math.ceil(24 / bw));
  const labels = bins
    .map((b, i) => {
      if (i % labelEvery !== 0 && i !== bins.length - 1) return "";
      const x = padLeft + i * bw + bw / 2;
      return `<text x="${x.toFixed(1)}" y="${H - padBottom + 15}" text-anchor="middle" class="axis">${fmtNum(
        b.from,
      )}</text>`;
    })
    .join("");
  const unitLabel = `<text x="${W - padRight}" y="${H - 4}" text-anchor="end" class="axis">${esc(opts.unit)}</text>`;

  let meanMark = "";
  if (opts.mean !== undefined && Number.isFinite(opts.mean)) {
    const mx = padLeft + ((opts.mean - min) / range) * plotW;
    const cx = Math.max(padLeft, Math.min(W - padRight, mx));
    meanMark = `<line x1="${cx.toFixed(1)}" y1="${padTop - 6}" x2="${cx.toFixed(1)}" y2="${
      H - padBottom
    }" class="meanline" /><text x="${cx.toFixed(1)}" y="${padTop - 10}" text-anchor="middle" class="meanlabel">mean ${fmtNum(
      opts.mean,
    )}</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
    ${yGrid.join("")}
    <line x1="${padLeft}" y1="${H - padBottom}" x2="${W - padRight}" y2="${H - padBottom}" class="axisline" />
    ${rects}${labels}${unitLabel}${meanMark}
  </svg>`;
}

const LEFT_COLOR = ACCENT;
const RIGHT_COLOR = "#5cc8ff";

/** Two overlaid histograms (left vs right key) on the same axes. Bins must share the same ranges. */
function barChartDual(left: Bin[], right: Bin[], unit: string): string {
  const bins = left.length ? left : right;
  if (bins.length === 0 || (left.every((b) => b.count === 0) && right.every((b) => b.count === 0)))
    return `<p class="muted">No data.</p>`;
  const W = 680;
  const H = 240;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 24;
  const padBottom = 34;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...left.map((b) => b.count), ...right.map((b) => b.count));
  const bw = plotW / bins.length;
  const yStep = Math.max(1, niceStep(max, 4));

  const yGrid: string[] = [];
  for (let v = 0; v <= max + 1e-9; v += yStep) {
    const y = H - padBottom - (v / max) * plotH;
    yGrid.push(
      `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${W - padRight}" y2="${y.toFixed(1)}" class="gridline" />` +
        `<text x="${padLeft - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="axis">${v}</text>`,
    );
  }

  const series = (bb: Bin[], color: string, key: string) =>
    bb
      .map((b, i) => {
        if (b.count === 0) return "";
        const h = (b.count / max) * plotH;
        const x = padLeft + i * bw;
        const y = H - padBottom - h;
        const tip = `${key} · ${fmtNum(b.from)}..${fmtNum(b.to)} ${unit} — ${b.count}`;
        return `<rect class="bar" data-tip="${esc(tip)}" x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(
          1,
          bw - 2,
        ).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}" fill-opacity="0.6"></rect>`;
      })
      .join("");

  const labelEvery = Math.max(1, Math.ceil(24 / bw));
  const labels = bins
    .map((b, i) => {
      if (i % labelEvery !== 0 && i !== bins.length - 1) return "";
      const x = padLeft + i * bw + bw / 2;
      return `<text x="${x.toFixed(1)}" y="${H - padBottom + 15}" text-anchor="middle" class="axis">${fmtNum(
        b.from,
      )}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
    ${yGrid.join("")}
    <line x1="${padLeft}" y1="${H - padBottom}" x2="${W - padRight}" y2="${H - padBottom}" class="axisline" />
    ${series(left, LEFT_COLOR, "Left")}${series(right, RIGHT_COLOR, "Right")}${labels}
    <text x="${W - padRight}" y="${H - 4}" text-anchor="end" class="axis">${esc(unit)}</text>
  </svg>`;
}

function tile(label: string, value: string, hint?: string): string {
  return `<div class="tile"><div class="tileval">${esc(value)}</div><div class="tilelabel">${esc(label)}</div>${
    hint ? `<div class="tilehint">${esc(hint)}</div>` : ""
  }</div>`;
}

function section(title: string, chart: string, explanation: string): string {
  return `<section><h2>${esc(title)}</h2>${chart}<p class="explain">${explanation}</p></section>`;
}

export function buildCheatReportHtml(data: CheatReportData): string {
  // Hit error histogram, symmetric around 0.
  const absMax = Math.max(50, ...data.offsets.map((o) => Math.abs(o)));
  const errBins = histogram(data.offsets, 5, -Math.ceil(absMax / 5) * 5, Math.ceil(absMax / 5) * 5);

  // Key-hold duration histogram (fine bins, ~40 bars like osu! hold-time distributions).
  const holdMax = Math.max(50, ...data.holdDurations);
  const holdBin = Math.max(3, Math.ceil(holdMax / 45));
  const holdTop = Math.ceil(holdMax / holdBin) * holdBin;
  const holdBins = histogram(data.holdDurations, holdBin, 0, holdTop);
  const leftBins = histogram(data.leftHolds, holdBin, 0, holdTop);
  const rightBins = histogram(data.rightHolds, holdBin, 0, holdTop);
  const holdMean = data.holdDurations.length
    ? data.holdDurations.reduce((a, b) => a + b, 0) / data.holdDurations.length
    : NaN;

  // Frame-time histogram (from the existing buckets) → numeric bins.
  const ftBins: Bin[] = data.frametime.histogram.map((b) => ({ from: b.ms, to: b.ms + 2, count: b.count }));

  // Dominant key-hold bin (for highlighting an auto-clicker-like spike).
  const holdTotal = data.holdDurations.length;
  const holdDomCount = Math.max(0, ...holdBins.map((b) => b.count));
  const holdDomSuspect = holdTotal > 0 && holdDomCount / holdTotal > 0.5;

  const flagsHtml =
    data.flags.length === 0
      ? `<div class="flag ok">✓ No suspicious patterns flagged.</div>`
      : data.flags
          .map(
            (f) =>
              `<div class="flag" style="border-left-color:${SEVERITY_COLOR[f.severity]}"><b style="color:${
                SEVERITY_COLOR[f.severity]
              }">${f.severity.toUpperCase()}</b> · <b>${esc(f.title)}</b><div class="flagdetail">${esc(
                f.detail,
              )}</div></div>`,
          )
          .join("");

  const snapRows =
    data.snaps.length === 0
      ? `<p class="muted">No suspicious cursor snaps found.</p>`
      : `<table><thead><tr><th>Time</th><th>Turn angle</th></tr></thead><tbody>${data.snaps
          .map((s) => `<tr><td>${timestamp(s.time)}</td><td>${s.angleDeg.toFixed(0)}°</td></tr>`)
          .join("")}</tbody></table>`;

  const tiles = [
    tile("Unstable rate", data.ur.toFixed(1), "lower = more consistent"),
    tile("Mean error", `${data.meanError >= 0 ? "+" : ""}${data.meanError.toFixed(1)} ms`, "+late / −early"),
    tile("Median frame time", `${data.frametime.medianMs.toFixed(1)} ms`, `~${Math.round(data.frametime.impliedFps)} FPS`),
    tile("Cursor snaps", String(data.snaps.length)),
    tile("Max cursor speed", `${data.maxCursorSpeed.toFixed(2)} px/ms`),
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cheat report — ${esc(data.title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #15151b; color: #ececf2; font: 15px/1.5 system-ui, "Segoe UI", Arial, sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 1.5rem; margin: 0 0 2px; }
  h2 { font-size: 1.05rem; margin: 28px 0 8px; color: ${ACCENT}; }
  .sub { color: #a0a0b0; margin: 0 0 20px; }
  .disclaimer { background: #3a2e18; border: 1px solid #6b5420; color: #f0d79a; padding: 10px 14px; border-radius: 8px; margin: 0 0 24px; font-size: 0.9rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 8px; }
  .tile { background: #1e1e27; border: 1px solid #2c2c38; border-radius: 10px; padding: 12px 14px; }
  .tileval { font-size: 1.5rem; font-weight: 800; color: ${ACCENT}; }
  .tilelabel { font-size: 0.8rem; color: #c8c8d4; margin-top: 2px; }
  .tilehint { font-size: 0.72rem; color: #8a8a99; margin-top: 2px; }
  .chart { width: 100%; height: auto; background: #1a1a22; border: 1px solid #2c2c38; border-radius: 10px; padding: 6px; }
  .bar { cursor: pointer; transition: opacity .08s; }
  .bar:hover { opacity: 0.7; }
  .axis { fill: #8a8a99; font-size: 11px; }
  .axisline { stroke: #3a3a46; stroke-width: 1; }
  .gridline { stroke: #26262f; stroke-width: 1; }
  .meanline { stroke: #ffd166; stroke-width: 1.5; stroke-dasharray: 4 3; }
  .meanlabel { fill: #ffd166; font-size: 11px; font-weight: 700; }
  #tip { position: fixed; pointer-events: none; z-index: 20; background: #000; color: #fff; border: 1px solid ${ACCENT}; padding: 5px 9px; border-radius: 6px; font-size: 0.82rem; opacity: 0; transition: opacity .08s; white-space: nowrap; }
  .explain { color: #b8b8c6; font-size: 0.9rem; margin: 10px 2px 0; }
  .flag { background: #1e1e27; border: 1px solid #2c2c38; border-left: 4px solid #ff5c5c; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; }
  .flag.ok { border-left-color: #4caf50; color: #9fdca3; }
  .verdict { display: inline-block; color: #15151b; font-weight: 800; padding: 5px 14px; border-radius: 8px; margin-bottom: 10px; }
  .toggle { background: #2a2a36; color: #ececf2; border: 1px solid #3a3a46; border-radius: 6px; padding: 4px 10px; font-size: 0.82rem; cursor: pointer; margin: 2px 0 6px; }
  .toggle:hover { background: #343442; }
  .legend { font-size: 0.82rem; color: #b8b8c6; margin-top: 4px; }
  .legend .sw { display: inline-block; width: 11px; height: 11px; border-radius: 2px; margin: 0 5px 0 12px; vertical-align: middle; }
  .flagdetail { color: #b8b8c6; font-size: 0.86rem; margin-top: 3px; }
  .muted { color: #8a8a99; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #2c2c38; font-size: 0.9rem; }
  th { color: #a0a0b0; font-weight: 600; }
  footer { margin-top: 40px; color: #6a6a78; font-size: 0.8rem; }
</style></head>
<body><div class="wrap">
  <h1>Cheat report</h1>
  <p class="sub">${esc(data.title)} — replay by <b>${esc(data.player)}</b></p>
  <div class="disclaimer">⚠️ These are heuristic hints, not proof. Review them yourself before drawing any conclusion.</div>
  <div class="tiles">${tiles}</div>

  <h2>⚠️ Flags</h2>
  ${(() => {
    const v = cheatVerdict(data.flags);
    const c = v === "suspicious" ? "#ff5c5c" : v === "review" ? "#ffb347" : "#4caf50";
    const label = v === "suspicious" ? "Suspicious" : v === "review" ? "Worth reviewing" : "Likely legit";
    return `<div class="verdict" style="background:${c}">${label}</div>`;
  })()}
  ${flagsHtml}

  ${section(
    "Frame times (timewarp)",
    barChart(ftBins, { mean: data.frametime.meanMs, unit: "ms", suspect: (b) => b.from < 4 && b.count > 0 }),
    `Distribution of the time between replay frames. Median ${data.frametime.medianMs.toFixed(1)} ms (~${Math.round(
      data.frametime.impliedFps,
    )} FPS). Timewarp shows up as frame times clustered at an impossibly low, very regular value — but high-refresh monitors legitimately produce low values, so judge the shape, not a single number.${
      data.frametime.suspicious ? " <b>Flagged:</b> unusually fast and regular frame times." : ""
    }`,
  )}

  ${section(
    "Hit error distribution",
    barChart(errBins, { mean: data.meanError, unit: "ms" }),
    `How early (left, −) or late (right, +) each hit was. A healthy play is a bell shape with some spread. An extremely narrow, perfectly centered distribution (very low unstable rate) can hint at relax/auto-tap, but strong legit players can also be very consistent.`,
  )}

  <section>
    <h2>Key-hold duration per circle</h2>
    <button class="toggle" onclick="toggleHold(this)">Separate keys</button>
    <div id="holdCombined">${barChart(holdBins, {
      mean: holdMean,
      unit: "ms",
      suspect: holdDomSuspect ? (b) => b.count === holdDomCount : undefined,
    })}</div>
    <div id="holdSeparated" style="display:none">
      ${barChartDual(leftBins, rightBins, "ms")}
      <div class="legend"><span class="sw" style="background:${LEFT_COLOR}"></span>Left key<span class="sw" style="background:${RIGHT_COLOR}"></span>Right key</div>
    </div>
    <p class="explain">How long the key stayed held for each hit circle (${
      data.holdDurations.length
    } measured). Humans vary; a spike of near-identical durations can hint at an auto-clicker or bot. Toggle <b>Separate keys</b> to compare left vs right — a cheat often locks one finger to a near-fixed value (a vertical line of one colour).</p>
  </section>

  <section><h2>Cursor snaps</h2>${snapRows}<p class="explain">Sharp cursor reversals (near-180° flicks over a large distance). A few can be legit flicks; many clustered ones can hint at aim assist. Max cursor speed: ${data.maxCursorSpeed.toFixed(
    2,
  )} px/ms.</p></section>

  <footer>Generated by osu!coach · ${new Date().toLocaleString()}</footer>
</div>
<div id="tip"></div>
<script>
  function toggleHold(btn) {
    var c = document.getElementById('holdCombined');
    var s = document.getElementById('holdSeparated');
    var sep = s.style.display === 'none';
    s.style.display = sep ? 'block' : 'none';
    c.style.display = sep ? 'none' : 'block';
    btn.textContent = sep ? 'Combined' : 'Separate keys';
  }
  (function () {
    var tip = document.getElementById('tip');
    document.querySelectorAll('.bar').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        tip.textContent = el.getAttribute('data-tip');
        tip.style.left = (e.clientX + 12) + 'px';
        tip.style.top = (e.clientY + 12) + 'px';
        tip.style.opacity = '1';
      });
      el.addEventListener('mouseleave', function () { tip.style.opacity = '0'; });
    });
  })();
</script>
</body></html>`;
}
