import { useState, useRef } from "react";

/* ═══════════════ PALETTE ═══════════════ */
const RED = "#E64626";
const RED_DEEP = "#9E2A12";
const INK = "#17150F";
const INK_2 = "#221F17";
const INK_3 = "#332F25";
const PAPER = "#FFFCF6";
const PAPER_2 = "#F8F2E8";
const RULE = "#E2D6C6";
const RULE_2 = "#CFBFAA";
const TEXT = "#1C1A15";
const TEXT_2 = "#5E574C";
const TEXT_3 = "#928878";
const AMBER = "#C07818";
const AMBER_BG = "#FBEED5";
const SAGE = "#4A7040";
const SAGE_BG = "#E8EFE2";

const SRC = [
  { line: "#E64626", fill: "#FBDACE", soft: "#FDEDE6" },
  { line: "#1F6F8B", fill: "#CFE3EA", soft: "#E8F2F5" },
  { line: "#C07818", fill: "#F7E4C4", soft: "#FBF2E2" },
  { line: "#6B4C9A", fill: "#DED3EE", soft: "#EFE9F7" },
  { line: "#2E7D5B", fill: "#CDE6DA", soft: "#E7F3ED" },
  { line: "#A63B62", fill: "#F1D2DE", soft: "#F8E9EF" },
  { line: "#7A5A32", fill: "#E5D8C4", soft: "#F2EBE1" },
  { line: "#3D5A80", fill: "#D3DDE9", soft: "#E9EEF4" },
];

const STOP = new Set(("a an the and or but if of to in on at for with by from as is are was were be been being this that these those it its they them their there here which who whom whose what when where how why not no nor so than then too very can will just should now also into about over under more most other some such only own same s t don").split(" "));

/* ═══════════════ TEXT UTILITIES ═══════════════ */
function tokenize(text) {
  const out = []; const re = /\S+/g; let m;
  while ((m = re.exec(text)) !== null) out.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  return out;
}
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

function splitSentences(text) {
  const out = []; const re = /[^.!?\n]+[.!?]*\s*/g; let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (m[0].trim()) out.push({ s: m.index, e: m.index + m[0].length });
  }
  return out;
}

function quoteRanges(text) {
  const ranges = []; const re = /[“”][^“”]{6,}[“”]|"[^"]{6,}"/g; let m;
  while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

const contentSet = (text) =>
  new Set(tokenize(text).map((t) => norm(t.w)).filter((w) => w.length > 2 && !STOP.has(w)));

/* ═══════════════ ANALYSIS ENGINE ═══════════════ */
function analyse(essay, sources, minW, ignoreQuotes) {
  const tk = tokenize(essay);
  const nz = tk.map((t) => norm(t.w));
  const n = tk.length;
  const owner = new Array(n).fill(-1);
  const runLen = new Array(n).fill(0);
  const prepared = sources.map((s) => tokenize(s).map((t) => norm(t.w)).filter(Boolean));
  const qr = ignoreQuotes ? quoteRanges(essay) : [];
  const inQuote = (pos) => qr.some(([a, b]) => pos >= a && pos < b);

  for (let i = 0; i < n; i++) {
    if (!nz[i] || inQuote(tk[i].s)) continue;
    for (let si = 0; si < prepared.length; si++) {
      const src = prepared[si];
      if (src.length < minW) continue;
      for (let j = 0; j <= src.length - minW; j++) {
        if (src[j] !== nz[i]) continue;
        let len = 0;
        while (i + len < n && j + len < src.length && nz[i + len] && nz[i + len] === src[j + len] && !inQuote(tk[i + len].s)) len++;
        if (len >= minW) {
          let hasContent = false;
          for (let k = 0; k < len; k++) if (!STOP.has(nz[i + k]) && nz[i + k].length > 2) hasContent = true;
          if (!hasContent) continue;
          for (let k = 0; k < len; k++) {
            if (len > runLen[i + k]) { runLen[i + k] = len; owner[i + k] = si; }
          }
        }
      }
    }
  }

  const spans = []; let cur = null;
  for (let i = 0; i < n; i++) {
    if (owner[i] >= 0) {
      if (cur && cur.src === owner[i]) { cur.end = tk[i].e; cur.words++; }
      else { if (cur) spans.push(cur); cur = { start: tk[i].s, end: tk[i].e, src: owner[i], words: 1 }; }
    } else if (cur) { spans.push(cur); cur = null; }
  }
  if (cur) spans.push(cur);

  const perSource = prepared.map(() => 0);
  let copied = 0;
  spans.forEach((sp) => { copied += sp.words; perSource[sp.src] += sp.words; });
  const longest = spans.reduce((a, b) => (b.words > (a ? a.words : 0) ? b : a), null);

  const srcSentSets = [];
  sources.forEach((s, si) => splitSentences(s).forEach((r) => {
    const set = contentSet(s.slice(r.s, r.e));
    if (set.size >= 3) srcSentSets.push({ set, si, text: s.slice(r.s, r.e).trim() });
  }));

  const sentences = splitSentences(essay).map((r, idx) => {
    const words = tk.filter((t) => t.s >= r.s && t.e <= r.e).length;
    const vb = spans.filter((sp) => sp.end > r.s && sp.start < r.e)
      .reduce((a, sp) => a + sp.words, 0);
    const set = contentSet(essay.slice(r.s, r.e));
    let best = 0, bestSrc = -1, bestText = "";
    if (set.size >= 3) {
      srcSentSets.forEach(({ set: ss, si, text }) => {
        let hit = 0; set.forEach((w) => { if (ss.has(w)) hit++; });
        const ratio = hit / set.size;
        if (ratio > best) { best = ratio; bestSrc = si; bestText = text; }
      });
    }
    const ratio = words ? vb / words : 0;
    const kind = ratio >= 0.34 ? "verbatim" : best >= 0.62 ? "para" : "own";
    return { ...r, idx, words, vb, kind, overlap: Math.round(best * 100), src: bestSrc, match: bestText };
  });

  const paraCount = sentences.filter((s) => s.kind === "para").length;
  const vbCount = sentences.filter((s) => s.kind === "verbatim").length;

  const buckets = [
    { label: `${minW}–6`, min: minW, max: 6, n: 0 },
    { label: "7–10", min: 7, max: 10, n: 0 },
    { label: "11–15", min: 11, max: 15, n: 0 },
    { label: "16–25", min: 16, max: 25, n: 0 },
    { label: "26+", min: 26, max: 1e9, n: 0 },
  ].filter((b) => b.max >= minW);
  spans.forEach((sp) => {
    const b = buckets.find((x) => sp.words >= x.min && sp.words <= x.max);
    if (b) b.n++;
  });

  return { spans, total: n, copied, perSource, longest, sentences, paraCount, vbCount, buckets };
}

/* ═══════════════ VERDICT BANDS ═══════════════ */
function verdictFor(pct) {
  if (pct < 5) return { name: "Substantially original", color: SAGE, note: "Very little text matches the sources word-for-word. Source use looks well paraphrased." };
  if (pct < 12) return { name: "Light source reliance", color: SAGE, note: "A small amount of wording is carried over. Check that each match is quoted and cited." };
  if (pct < 25) return { name: "Moderate source reliance", color: AMBER, note: "Noticeable stretches of source wording remain. Rewrite the longest matches in your own words." };
  if (pct < 40) return { name: "Heavy source reliance", color: RED, note: "Much of the essay reuses source wording. This needs substantial rewriting before submission." };
  return { name: "Critical source reliance", color: RED_DEEP, note: "The essay is largely built from copied wording. Rebuild the argument from your own notes." };
}

/* ═══════════════ ICONS ═══════════════ */
const ic = (d, c, s = 14, extra = null) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {d.map((p, i) => <path key={i} d={p} />)}
    {extra}
  </svg>
);
const I = {
  doc: (c, s) => ic(["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6"], c, s),
  layers: (c, s) => ic(["M12 2 2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"], c, s),
  scan: (c, s) => ic(["M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2", "M7 12h10"], c, s),
  print: (c, s) => ic(["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"], c, s),
  down: (c, s) => ic(["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"], c, s),
  copy: (c, s) => ic(["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M9 2h6v4H9z"], c, s),
  x: (c, s) => ic(["M18 6 6 18", "M6 6l12 12"], c, s),
  plus: (c, s) => ic(["M12 5v14", "M5 12h14"], c, s),
  book: (c, s) => ic(["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"], c, s),
  target: (c, s) => ic(["M12 2v4", "M12 18v4", "M2 12h4", "M18 12h4"], c, s, <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /></>),
  grid: (c, s) => ic(["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"], c, s),
  list: (c, s) => ic(["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"], c, s),
};

/* ═══════════════ ARC GAUGE ═══════════════ */
const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
};
const arcPath = (cx, cy, r, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
};

function Gauge({ pct }) {
  const W = 260, H = 168, cx = W / 2, cy = 132, r = 100;
  const A0 = 200, SWEEP = 220;
  const ang = (p) => A0 - (Math.min(p, 100) / 100) * SWEEP;
  const v = verdictFor(pct);
  const bands = [
    { from: 0, to: 12, c: SAGE },
    { from: 12, to: 25, c: AMBER },
    { from: 25, to: 40, c: RED },
    { from: 40, to: 100, c: RED_DEEP },
  ];
  const [nx, ny] = polar(cx, cy, r - 30, ang(pct));
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, display: "block" }} role="img" aria-label={`${pct.toFixed(1)} percent copied`}>
      {bands.map((b, i) => (
        <path key={i} d={arcPath(cx, cy, r, ang(b.from), ang(b.to))} stroke={b.c} strokeWidth="7" fill="none" opacity="0.22" strokeLinecap="butt" />
      ))}
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) => {
        const [x1, y1] = polar(cx, cy, r - 11, ang(t));
        const [x2, y2] = polar(cx, cy, t % 50 === 0 ? r - 20 : r - 16, ang(t));
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.30)" strokeWidth={t % 50 === 0 ? 1.6 : 1} />;
      })}
      {[0, 50, 100].map((t) => {
        const [x, y] = polar(cx, cy, r - 32, ang(t));
        return <text key={t} x={x} y={y + 3} textAnchor="middle" style={{ fontSize: 9, fill: "rgba(255,255,255,.42)", fontFamily: "Inter, sans-serif", letterSpacing: .5 }}>{t}</text>;
      })}
      <path d={arcPath(cx, cy, r, ang(0), ang(Math.max(pct, 0.4)))} stroke={v.color} strokeWidth="7" fill="none" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 7px ${v.color}aa)` }} />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".92" />
      <circle cx={cx} cy={cy} r="6" fill={INK} stroke="#fff" strokeWidth="2" />
      <text x={cx} y={cy - 40} textAnchor="middle" style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 46, fontWeight: 600, fill: "#fff", letterSpacing: -1 }}>
        {pct.toFixed(1)}<tspan style={{ fontSize: 20, fill: "rgba(255,255,255,.55)" }}>%</tspan>
      </text>
      <text x={cx} y={cy - 22} textAnchor="middle" style={{ fontFamily: "Inter, sans-serif", fontSize: 9, letterSpacing: 2, fill: "rgba(255,255,255,.45)" }}>
        COPIED VERBATIM
      </text>
    </svg>
  );
}

/* ═══════════════ DENSITY STRIP ═══════════════ */
function Density({ result, onJump }) {
  const H = 74, W = 1000;
  const len = result.essay.length || 1;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", cursor: "pointer" }}>
      <rect width={W} height={H} fill={PAPER_2} />
      {result.sentences.map((s, i) => {
        const x = (s.s / len) * W, w = Math.max(((s.e - s.s) / len) * W, 0.8);
        const fill = s.kind === "verbatim" ? "transparent" : s.kind === "para" ? AMBER_BG : SAGE_BG;
        return <rect key={`b${i}`} x={x} y="0" width={w} height={H} fill={fill} />;
      })}
      {result.spans.map((sp, i) => {
        const x = (sp.start / len) * W;
        const w = Math.max(((sp.end - sp.start) / len) * W, 1.6);
        const h = Math.min(14 + sp.words * 3.4, H);
        return (
          <rect key={i} x={x} y={H - h} width={w} height={h} fill={SRC[sp.src % 8].line} opacity="0.92"
            onClick={() => onJump(sp.start)}>
            <title>{`Source ${sp.src + 1} · ${sp.words} words`}</title>
          </rect>
        );
      })}
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke={RULE_2} strokeWidth="1" />
    </svg>
  );
}

/* ═══════════════ SPARK BARS ═══════════════ */
function Histogram({ buckets }) {
  const max = Math.max(...buckets.map((b) => b.n), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 96 }}>
      {buckets.map((b) => (
        <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: b.n ? TEXT : TEXT_3, fontFamily: "Fraunces, Georgia, serif" }}>{b.n}</div>
          <div style={{ width: "100%", height: `${Math.max((b.n / max) * 62, b.n ? 5 : 2)}px`, background: b.n ? RED : RULE, transition: "height .7s cubic-bezier(.16,1,.3,1)" }} />
          <div style={{ fontSize: 10, color: TEXT_3, letterSpacing: .3 }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

const DEMO_ESSAY = `Urban green space plays a critical role in the wellbeing of city residents. Research consistently shows that access to parks reduces stress and encourages physical activity among people living in dense neighbourhoods. In my view, councils should therefore treat parkland as essential infrastructure rather than decoration.

The evidence on air quality is also strong. Trees in urban areas absorb pollutants and lower ambient temperatures during heatwaves, which matters a great deal in cities that are warming faster than surrounding regions. Some planners argue that the cost of maintaining these spaces outweighs the benefit, but this ignores the long-term savings in public health spending.

A further consideration is equity. Wealthier suburbs typically enjoy more tree cover than lower-income areas, and this uneven distribution means the benefits of green space are not shared fairly across the population.`;

const DEMO_SOURCES = [
  `Access to parks reduces stress and encourages physical activity among people living in dense neighbourhoods. Urban planners have long recognised the value of open space, though funding pressures often push it down the priority list.`,
  `Trees in urban areas absorb pollutants and lower ambient temperatures during heatwaves. Cities are warming faster than surrounding rural regions, a phenomenon known as the urban heat island effect.`,
];

/* ═══════════════ APP ═══════════════ */
export default function App() {
  const [essay, setEssay] = useState("");
  const [sources, setSources] = useState(["", ""]);
  const [result, setResult] = useState(null);
  const [minW, setMinW] = useState(4);
  const [ignoreQuotes, setIgnoreQuotes] = useState(true);
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState("all");
  const [toast, setToast] = useState(null);
  const [active, setActive] = useState(null);
  const essayRef = useRef(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  const wc = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  const setSource = (i, v) => setSources((p) => p.map((s, j) => (j === i ? v : s)));
  const addSource = () => setSources((p) => (p.length >= 8 ? p : [...p, ""]));
  const removeSource = (i) => setSources((p) => (p.length <= 1 ? p : p.filter((_, j) => j !== i)));

  const run = () => {
    if (!essay.trim()) return flash("Add an essay to check");
    if (!sources.some((s) => s.trim())) return flash("Add at least one source text");
    const valid = sources.filter((s) => s.trim());
    const res = analyse(essay, valid, minW, ignoreQuotes);
    res.essay = essay;
    setResult(res);
    setTab("overview");
  };

  const reset = () => { setResult(null); setActive(null); setTab("overview"); };
  const loadDemo = () => { setEssay(DEMO_ESSAY); setSources(DEMO_SOURCES); flash("Example loaded — press Analyse"); };

  const jumpToOffset = (offset) => {
    if (!result) return;
    const s = result.sentences.find((x) => offset >= x.s && offset < x.e) || result.sentences[0];
    if (!s) return;
    setTab("essay");
    setActive(s.idx);
    setTimeout(() => {
      const el = document.getElementById(`sent-${s.idx}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 90);
  };

  /* ---------- annotated essay, rendered sentence by sentence ---------- */
  const renderEssay = () => {
    if (!result) return null;
    return result.sentences.map((sent) => {
      if (view !== "all" && sent.kind !== view) return null;
      const inner = [];
      let pos = sent.s;
      result.spans
        .filter((sp) => sp.end > sent.s && sp.start < sent.e)
        .sort((a, b) => a.start - b.start)
        .forEach((sp, k) => {
          const a = Math.max(sp.start, sent.s), b = Math.min(sp.end, sent.e);
          if (pos < a) inner.push(<span key={`p${k}`}>{result.essay.slice(pos, a)}</span>);
          const c = SRC[sp.src % 8];
          inner.push(
            <mark key={`m${k}`} title={`Source ${sp.src + 1} · ${sp.words} words`}
              style={{ background: c.fill, color: TEXT, borderBottom: `2px solid ${c.line}`, padding: "1px 0", borderRadius: 0 }}>
              {result.essay.slice(a, b)}
            </mark>
          );
          pos = b;
        });
      if (pos < sent.e) inner.push(<span key="tail">{result.essay.slice(pos, sent.e)}</span>);

      const isActive = active === sent.idx;
      const bg = sent.kind === "para" ? AMBER_BG : "transparent";
      return (
        <span key={sent.idx} id={`sent-${sent.idx}`} onClick={() => setActive(isActive ? null : sent.idx)}
          style={{
            background: isActive ? "#FFF3B0" : bg,
            borderBottom: sent.kind === "para" ? `2px dotted ${AMBER}` : "none",
            boxShadow: isActive ? `0 0 0 3px #FFF3B0` : "none",
            cursor: "pointer", transition: "background .25s",
          }}>
          {inner}
        </span>
      );
    });
  };

  /* ---------- export ---------- */
  const buildReport = () => {
    const pctv = (result.copied / result.total) * 100;
    const v = verdictFor(pctv);
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const rows = [...result.spans].sort((a, b) => b.words - a.words)
      .map((sp) => `<tr><td>S${sp.src + 1}</td><td>${sp.words}</td><td>${esc(result.essay.slice(sp.start, sp.end))}</td></tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Essay copy report</title>
<style>body{font:14px/1.6 Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1C1A15}
h1{font-size:24px;margin:0 0 4px}.sub{color:#777;font-size:12px;margin-bottom:28px}
.v{background:${v.color}18;border-left:4px solid ${v.color};padding:14px 18px;margin:0 0 24px}
.big{font-size:34px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #E2D6C6;vertical-align:top}
th{font:600 10px/1 Arial;text-transform:uppercase;letter-spacing:1px;color:#928878}
td:nth-child(1),td:nth-child(2){width:44px;font-weight:700}
.k{display:flex;gap:26px;margin:18px 0 26px}.k div span{display:block;font-size:11px;color:#928878;text-transform:uppercase;letter-spacing:1px}
.k div b{font-size:22px}</style></head><body>
<h1>Essay copy detection report</h1>
<div class="sub">The University of Sydney &middot; generated ${new Date().toLocaleString()}</div>
<div class="v"><div class="big">${pctv.toFixed(1)}%</div><strong>${v.name}</strong><br>${v.note}</div>
<div class="k">
<div><span>Total words</span><b>${result.total}</b></div>
<div><span>Copied words</span><b>${result.copied}</b></div>
<div><span>Verbatim sentences</span><b>${result.vbCount}</b></div>
<div><span>Close paraphrase</span><b>${result.paraCount}</b></div>
<div><span>Longest match</span><b>${result.longest ? result.longest.words : 0}w</b></div>
</div>
<h2 style="font-size:15px">Matched passages</h2>
<table><tr><th>Src</th><th>Words</th><th>Passage</th></tr>${rows}</table>
</body></html>`;
  };

  const download = () => {
    const blob = new Blob([buildReport()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "essay-copy-report.html"; a.click();
    URL.revokeObjectURL(url);
    flash("Report downloaded");
  };

  const copyStats = () => {
    const p = ((result.copied / result.total) * 100).toFixed(1);
    navigator.clipboard.writeText(
      `Essay copy detection\n${p}% copied — ${result.copied}/${result.total} words\n${result.spans.length} matched passages\n${result.vbCount} verbatim sentences, ${result.paraCount} closely paraphrased\nLongest unbroken match: ${result.longest ? result.longest.words : 0} words`
    ).then(() => flash("Summary copied to clipboard"));
  };

  const pct = result ? (result.copied / result.total) * 100 : 0;
  const verdict = verdictFor(pct);
  const ownPct = result ? 100 - pct : 0;
  const essayWords = wc(essay);

  const panel = { background: PAPER, border: `1px solid ${RULE}` };
  const capLabel = { fontSize: 9.5, letterSpacing: 1.6, fontWeight: 700, textTransform: "uppercase", color: TEXT_3 };

  return (
    <div style={{ background: INK, minHeight: "100vh", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
body{margin:0;background:${INK}}
::selection{background:${RED};color:#fff}
.btn{cursor:pointer;border:none;font-family:inherit;transition:transform .12s,filter .15s,background .15s}
.btn:hover{filter:brightness(1.08)}.btn:active{transform:scale(.98)}
.btn:focus-visible,.tab:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid ${RED};outline-offset:2px}
.ghost{background:transparent;border:1px solid ${RULE};color:${TEXT_2}}
.ghost:hover{background:${PAPER_2};border-color:${RULE_2}}
.dark-ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.86)}
.dark-ghost:hover{background:rgba(255,255,255,.12)}
.tab{background:transparent;border:none;border-bottom:2px solid transparent;color:${TEXT_3};padding:12px 4px;font:600 11.5px/1 Inter,sans-serif;letter-spacing:.6px;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:7px;transition:color .15s,border-color .15s}
.tab:hover{color:${TEXT}}
.tab.on{color:${TEXT};border-bottom-color:${RED}}
.vw{background:transparent;border:1px solid rgba(255,255,255,.22);color:rgba(255,255,255,.78);padding:5px 10px;font:600 10px/1 Inter,sans-serif;letter-spacing:.6px;cursor:pointer;transition:all .15s}
.vw:hover{border-color:rgba(255,255,255,.55);color:#fff}
.vw.on{background:#fff;color:${INK};border-color:#fff}
textarea{font-family:'Fraunces',Georgia,serif}
textarea:focus{outline:none;background:#FFFEFB}
textarea::placeholder{color:${TEXT_3};font-style:italic}
.rise{animation:rise .55s cubic-bezier(.16,1,.3,1) both}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.pop{animation:pop .35s cubic-bezier(.34,1.4,.64,1) both}
@keyframes pop{from{opacity:0;transform:translateY(16px) translateX(-50%)}to{opacity:1;transform:translateY(0) translateX(-50%)}}
.srow:hover{background:${PAPER_2}}
.scroll::-webkit-scrollbar{width:8px;height:8px}
.scroll::-webkit-scrollbar-thumb{background:${RULE_2}}
.scroll::-webkit-scrollbar-track{background:${PAPER_2}}
.wrap{max-width:1240px;margin:0 auto;padding:0 30px}
.split{display:grid;grid-template-columns:1.15fr .85fr;gap:22px}
.gauge-row{display:grid;grid-template-columns:280px 1fr;gap:34px;align-items:center}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:${RULE}}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:900px){
.wrap{padding:0 16px}
.split,.two{grid-template-columns:1fr}
.gauge-row{grid-template-columns:1fr;gap:18px;justify-items:center;text-align:center}
.kpis{grid-template-columns:repeat(2,1fr)}
.tabbar{overflow-x:auto}
}
@media print{.noprint{display:none!important}body{background:#fff}}
      `}</style>

      {/* ══════ MASTHEAD ══════ */}
      <header style={{ background: INK, borderBottom: "1px solid rgba(255,255,255,.10)" }}>
        <div className="wrap" style={{ padding: "26px 30px 22px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
              <span style={{ width: 26, height: 3, background: RED, display: "block" }} />
              <span style={{ fontSize: 10, letterSpacing: 2.4, fontWeight: 600, color: "rgba(255,255,255,.5)" }}>THE UNIVERSITY OF SYDNEY</span>
            </div>
            <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 38, fontWeight: 600, color: "#fff", margin: 0, letterSpacing: -0.8, lineHeight: 1.05 }}>
              Essay Copy Detector
            </h1>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.6)", margin: "10px 0 0", maxWidth: 540, lineHeight: 1.6 }}>
              Compare a draft against its source readings to see exactly how much wording was carried over instead of paraphrased.
            </p>
          </div>
          {!result && (
            <button className="btn dark-ghost noprint" onClick={loadDemo} style={{ padding: "9px 15px", fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              {I.book("rgba(255,255,255,.8)", 13)} Load example
            </button>
          )}
        </div>
      </header>

      {/* ══════ INPUT STAGE ══════ */}
      {!result && (
        <main className="wrap rise" style={{ padding: "26px 30px 46px" }}>
          <div className="split">
            <section style={{ ...panel, display: "flex", flexDirection: "column", minHeight: 430 }}>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${RULE}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: PAPER_2 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, ...capLabel, color: TEXT }}>{I.doc(TEXT, 13)} The essay</span>
                <span style={{ fontSize: 11, color: TEXT_3, fontVariantNumeric: "tabular-nums" }}>{essayWords} words</span>
              </div>
              <textarea value={essay} onChange={(e) => setEssay(e.target.value)}
                placeholder="Paste the student draft here…"
                style={{ flex: 1, width: "100%", padding: "20px 22px", border: "none", resize: "none", fontSize: 15, lineHeight: 1.75, color: TEXT, background: "transparent" }} />
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...capLabel, color: "rgba(255,255,255,.55)", display: "flex", alignItems: "center", gap: 8 }}>
                  {I.layers("rgba(255,255,255,.55)", 13)} Source texts
                </span>
                <button className="btn dark-ghost noprint" onClick={addSource} disabled={sources.length >= 8}
                  style={{ padding: "6px 11px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: sources.length >= 8 ? .4 : 1 }}>
                  {I.plus("rgba(255,255,255,.8)", 12)} Add source
                </button>
              </div>
              {sources.map((s, i) => (
                <div key={i} style={{ ...panel, display: "flex", flexDirection: "column", flex: 1, minHeight: 96 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 0 0", borderBottom: `1px solid ${RULE}` }}>
                    <span style={{ background: SRC[i % 8].line, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "7px 11px" }}>S{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 11, color: TEXT_3, paddingLeft: 12, fontVariantNumeric: "tabular-nums" }}>{wc(s)} words</span>
                    {sources.length > 1 && (
                      <button className="btn noprint" onClick={() => removeSource(i)} aria-label={`Remove source ${i + 1}`}
                        style={{ background: "transparent", padding: "7px 11px" }}>{I.x(TEXT_3, 12)}</button>
                    )}
                  </div>
                  <textarea value={s} onChange={(e) => setSource(i, e.target.value)}
                    placeholder={`Paste source ${i + 1}…`}
                    style={{ flex: 1, width: "100%", padding: "13px 16px", border: "none", resize: "none", fontSize: 13, lineHeight: 1.65, color: TEXT, background: "transparent" }} />
                </div>
              ))}
            </section>
          </div>

          {/* controls */}
          <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ ...panel, padding: "11px 15px", display: "flex", alignItems: "center", gap: 11 }}>
              <label htmlFor="mw" style={{ fontSize: 12, fontWeight: 500, color: TEXT_2 }}>Flag runs of</label>
              <input id="mw" type="number" min="3" max="12" value={minW}
                onChange={(e) => setMinW(Math.min(12, Math.max(3, parseInt(e.target.value) || 3)))}
                style={{ width: 48, padding: "6px 8px", border: `1px solid ${RULE}`, fontSize: 13, fontFamily: "inherit", textAlign: "center", background: PAPER }} />
              <span style={{ fontSize: 12, color: TEXT_2 }}>words or more</span>
            </div>
            <label style={{ ...panel, padding: "12px 15px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 12, color: TEXT_2, fontWeight: 500 }}>
              <input type="checkbox" checked={ignoreQuotes} onChange={(e) => setIgnoreQuotes(e.target.checked)} style={{ accentColor: RED, width: 15, height: 15 }} />
              Skip text inside quotation marks
            </label>
            <button className="btn" onClick={run}
              style={{ background: RED, color: "#fff", padding: "14px 30px", fontSize: 12.5, fontWeight: 700, letterSpacing: 1, flex: 1, minWidth: 190, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
              {I.scan("#fff", 15)} ANALYSE ESSAY
            </button>
          </div>
        </main>
      )}

      {/* ══════ RESULTS ══════ */}
      {result && (
        <>
          {/* verdict banner */}
          <section className="rise" style={{ background: INK_2, borderBottom: "1px solid rgba(255,255,255,.09)" }}>
            <div className="wrap" style={{ padding: "30px 30px 34px" }}>
              <div className="gauge-row">
                <Gauge pct={pct} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ background: verdict.color, color: "#fff", padding: "5px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
                      {verdict.name}
                    </span>
                  </div>
                  <p style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 20, lineHeight: 1.5, color: "rgba(255,255,255,.94)", margin: "0 0 16px", maxWidth: 560, fontWeight: 400 }}>
                    {verdict.note}
                  </p>
                  <div className="noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" onClick={download} style={{ background: RED, color: "#fff", padding: "10px 16px", fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                      {I.down("#fff", 13)} Download report
                    </button>
                    <button className="btn dark-ghost" onClick={copyStats} style={{ padding: "10px 16px", fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                      {I.copy("rgba(255,255,255,.85)", 13)} Copy summary
                    </button>
                    <button className="btn dark-ghost" onClick={() => window.print()} style={{ padding: "10px 16px", fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                      {I.print("rgba(255,255,255,.85)", 13)} Print
                    </button>
                    <button className="btn dark-ghost" onClick={reset} style={{ padding: "10px 16px", fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                      {I.x("rgba(255,255,255,.85)", 13)} New check
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* KPI ledger */}
          <section style={{ background: RULE }}>
            <div className="wrap" style={{ padding: 0 }}>
              <div className="kpis">
                {[
                  { l: "Words checked", v: result.total, s: `${result.sentences.length} sentences` },
                  { l: "Copied words", v: result.copied, s: `${result.spans.length} passages`, c: RED },
                  { l: "Longest match", v: result.longest ? `${result.longest.words}w` : "—", s: result.longest ? `from Source ${result.longest.src + 1}` : "no matches", c: RED },
                  { l: "Own sentences", v: result.sentences.length - result.vbCount - result.paraCount, s: `${result.vbCount} verbatim · ${result.paraCount} paraphrased`, c: SAGE },
                ].map((k) => (
                  <div key={k.l} style={{ background: PAPER, padding: "18px 22px" }}>
                    <div style={capLabel}>{k.l}</div>
                    <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 30, fontWeight: 600, color: k.c || TEXT, lineHeight: 1.1, margin: "6px 0 3px" }}>{k.v}</div>
                    <div style={{ fontSize: 11, color: TEXT_3 }}>{k.s}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* tabs */}
          <nav style={{ background: PAPER, borderBottom: `1px solid ${RULE}`, position: "sticky", top: 0, zIndex: 20 }} className="noprint">
            <div className="wrap tabbar" style={{ display: "flex", gap: 26 }}>
              {[["overview", "Overview", I.grid], ["passages", `Passages (${result.spans.length})`, I.target], ["sentences", "Sentence audit", I.list], ["essay", "Annotated essay", I.doc]].map(([k, l, icon]) => (
                <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
                  {icon(tab === k ? TEXT : TEXT_3, 14)} {l}
                </button>
              ))}
            </div>
          </nav>

          <main style={{ background: PAPER_2, minHeight: "50vh", paddingBottom: 50 }}>
            <div className="wrap" style={{ padding: "24px 30px" }}>

              {/* ───── OVERVIEW ───── */}
              {tab === "overview" && (
                <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ ...panel }}>
                    <div style={{ padding: "13px 20px", borderBottom: `1px solid ${RULE}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span style={capLabel}>Where copying falls across the essay</span>
                      <span style={{ fontSize: 11, color: TEXT_3 }}>bar height = match length · click to jump</span>
                    </div>
                    <Density result={result} onJump={jumpToOffset} />
                    <div style={{ padding: "10px 20px", borderTop: `1px solid ${RULE}`, display: "flex", gap: 8, justifyContent: "space-between", fontSize: 10.5, color: TEXT_3 }}>
                      <span>start of essay</span><span>end of essay</span>
                    </div>
                  </div>

                  <div className="two">
                    <div style={{ ...panel, padding: "18px 22px" }}>
                      <div style={{ ...capLabel, marginBottom: 14 }}>Composition by source</div>
                      <div style={{ display: "flex", height: 26, border: `1px solid ${RULE}` }}>
                        {result.perSource.map((w, i) => w > 0 ? (
                          <div key={i} title={`Source ${i + 1}: ${w} words`}
                            style={{ width: `${(w / result.total) * 100}%`, background: SRC[i % 8].line, transition: "width .9s cubic-bezier(.16,1,.3,1)" }} />
                        ) : null)}
                        <div style={{ width: `${ownPct}%`, background: `repeating-linear-gradient(45deg,${PAPER_2},${PAPER_2} 5px,${PAPER} 5px,${PAPER} 10px)`, transition: "width .9s" }} />
                      </div>
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                        {result.perSource.map((w, i) => w > 0 ? (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: TEXT_2 }}>
                            <span style={{ width: 12, height: 12, background: SRC[i % 8].line, flexShrink: 0 }} />
                            <strong style={{ color: TEXT, minWidth: 24 }}>S{i + 1}</strong>
                            <span style={{ flex: 1, height: 1, background: RULE }} />
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{w} words · {((w / result.total) * 100).toFixed(1)}%</span>
                          </div>
                        ) : null)}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: TEXT_2 }}>
                          <span style={{ width: 12, height: 12, background: PAPER, border: `1px solid ${RULE_2}`, flexShrink: 0 }} />
                          <strong style={{ color: TEXT, minWidth: 24 }}>Own</strong>
                          <span style={{ flex: 1, height: 1, background: RULE }} />
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{result.total - result.copied} words · {ownPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ ...panel, padding: "18px 22px" }}>
                      <div style={{ ...capLabel, marginBottom: 4 }}>Length of matched runs</div>
                      <div style={{ fontSize: 11.5, color: TEXT_3, marginBottom: 16 }}>Long unbroken runs are the strongest signal of copying.</div>
                      <Histogram buckets={result.buckets} />
                    </div>
                  </div>

                  {result.longest && (
                    <blockquote style={{ margin: 0, background: PAPER, borderLeft: `4px solid ${RED}`, padding: "20px 26px", border: `1px solid ${RULE}`, borderLeftWidth: 4, borderLeftColor: RED }}>
                      <div style={{ ...capLabel, color: RED, marginBottom: 10 }}>Longest unbroken match · {result.longest.words} words · Source {result.longest.src + 1}</div>
                      <p style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 17, lineHeight: 1.65, color: TEXT, margin: 0, fontStyle: "italic" }}>
                        “{result.essay.slice(result.longest.start, result.longest.end)}”
                      </p>
                      <button className="btn ghost noprint" onClick={() => jumpToOffset(result.longest.start)}
                        style={{ marginTop: 14, padding: "7px 13px", fontSize: 11, fontWeight: 600 }}>Show in essay</button>
                    </blockquote>
                  )}
                </div>
              )}

              {/* ───── PASSAGES ───── */}
              {tab === "passages" && (
                <div className="rise" style={{ ...panel }}>
                  <div style={{ padding: "13px 20px", borderBottom: `1px solid ${RULE}`, display: "flex", justifyContent: "space-between", background: PAPER_2 }}>
                    <span style={capLabel}>Every matched passage, longest first</span>
                    <span style={{ fontSize: 11, color: TEXT_3 }}>{result.spans.length} total</span>
                  </div>
                  {result.spans.length === 0 ? (
                    <div style={{ padding: "56px 24px", textAlign: "center", color: TEXT_3, fontSize: 14 }}>
                      No runs of {minW} or more matching words were found.
                    </div>
                  ) : (
                    <div className="scroll" style={{ maxHeight: "58vh", overflowY: "auto" }}>
                      {[...result.spans].sort((a, b) => b.words - a.words).map((sp, i) => {
                        const c = SRC[sp.src % 8];
                        return (
                          <div key={i} className="srow" onClick={() => jumpToOffset(sp.start)}
                            style={{ display: "flex", gap: 14, padding: "14px 20px", borderBottom: `1px solid ${RULE}`, cursor: "pointer", alignItems: "flex-start" }}>
                            <span style={{ background: c.line, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 7px", flexShrink: 0 }}>S{sp.src + 1}</span>
                            <span style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 17, fontWeight: 600, color: TEXT, minWidth: 34, flexShrink: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{sp.words}</span>
                            <span style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 14, lineHeight: 1.6, color: TEXT_2 }}>
                              “{result.essay.slice(sp.start, sp.end)}”
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ───── SENTENCE AUDIT ───── */}
              {tab === "sentences" && (
                <div className="rise" style={{ ...panel }}>
                  <div style={{ padding: "13px 20px", borderBottom: `1px solid ${RULE}`, background: PAPER_2, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span style={capLabel}>Sentence-by-sentence classification</span>
                    <span style={{ fontSize: 11, color: TEXT_3 }}>overlap = shared content words with nearest source sentence</span>
                  </div>
                  <div className="scroll" style={{ maxHeight: "58vh", overflowY: "auto" }}>
                    {result.sentences.map((s) => {
                      const tone = s.kind === "verbatim" ? { c: RED, bg: SRC[0].soft, l: "Verbatim" }
                        : s.kind === "para" ? { c: AMBER, bg: AMBER_BG, l: "Paraphrase" }
                        : { c: SAGE, bg: SAGE_BG, l: "Own" };
                      return (
                        <div key={s.idx} className="srow" onClick={() => jumpToOffset(s.s)}
                          style={{ display: "flex", gap: 14, padding: "13px 20px", borderBottom: `1px solid ${RULE}`, cursor: "pointer", alignItems: "flex-start" }}>
                          <span style={{ fontSize: 11, color: TEXT_3, minWidth: 26, paddingTop: 4, fontVariantNumeric: "tabular-nums" }}>{s.idx + 1}</span>
                          <span style={{ background: tone.bg, color: tone.c, border: `1px solid ${tone.c}44`, fontSize: 10, fontWeight: 700, padding: "3px 8px", flexShrink: 0, minWidth: 84, textAlign: "center" }}>{tone.l}</span>
                          <span style={{ flex: 1, fontFamily: "Fraunces, Georgia, serif", fontSize: 13.5, lineHeight: 1.6, color: TEXT_2 }}>
                            {result.essay.slice(s.s, s.e).trim().slice(0, 190)}{s.e - s.s > 190 ? "…" : ""}
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, minWidth: 78 }}>
                            <span style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 15, fontWeight: 600, color: s.overlap >= 62 ? AMBER : TEXT_3, fontVariantNumeric: "tabular-nums" }}>{s.overlap}%</span>
                            <span style={{ width: 66, height: 3, background: RULE }}>
                              <span style={{ display: "block", height: 3, width: `${s.overlap}%`, background: s.overlap >= 62 ? AMBER : RULE_2 }} />
                            </span>
                            <span style={{ fontSize: 10, color: TEXT_3 }}>{s.words} words</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ───── ANNOTATED ESSAY ───── */}
              {tab === "essay" && (
                <div className="rise" style={{ ...panel }}>
                  <div style={{ padding: "12px 20px", background: INK_3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ ...capLabel, color: "rgba(255,255,255,.65)" }}>Annotated essay</span>
                    <div className="noprint" style={{ display: "flex", gap: 5 }}>
                      {[["all", "ALL"], ["verbatim", "VERBATIM"], ["para", "PARAPHRASE"], ["own", "OWN ONLY"]].map(([k, l]) => (
                        <button key={k} className={`vw ${view === k ? "on" : ""}`} onClick={() => setView(k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "13px 26px", background: PAPER_2, borderBottom: `1px solid ${RULE}`, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 11.5, color: TEXT_2 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: SRC[0].fill, borderBottom: `2px solid ${SRC[0].line}`, padding: "1px 9px" }}>abc</span> copied word-for-word
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: AMBER_BG, borderBottom: `2px dotted ${AMBER}`, padding: "1px 9px" }}>abc</span> closely paraphrased
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ padding: "1px 9px" }}>abc</span> student's own
                    </span>
                    <span style={{ marginLeft: "auto", color: TEXT_3 }}>click any sentence to pin it</span>
                  </div>
                  <div ref={essayRef} style={{ padding: "34px 40px 44px", fontFamily: "Fraunces, Georgia, serif", fontSize: 16.5, lineHeight: 2.1, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 780, color: TEXT }}>
                    {renderEssay()}
                  </div>
                </div>
              )}
            </div>
          </main>
        </>
      )}

      {/* ══════ FOOTER ══════ */}
      <footer style={{ background: INK, borderTop: "1px solid rgba(255,255,255,.10)" }}>
        <div className="wrap" style={{ padding: "22px 30px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: "rgba(255,255,255,.42)" }}>
          <span>&copy; The University of Sydney &middot; Essay Copy Detector</span>
          <span>Runs entirely in your browser. No text is uploaded or stored.</span>
        </div>
      </footer>

      {toast && (
        <div className="pop" style={{ position: "fixed", bottom: 28, left: "50%", background: INK_3, color: "#fff", padding: "13px 22px", fontSize: 12.5, fontWeight: 500, zIndex: 60, boxShadow: "0 10px 34px rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.14)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
