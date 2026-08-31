import { useState, useEffect } from "react";

/* ═══════════ PALETTE ═══════════ */
const RED = "#E64626";
const INK = "#1A1814";
const INK_2 = "#2C2822";
const PAGE = "#F5F1EA";
const CARD = "#FFFFFF";
const RULE = "#E3DCD1";
const RULE_2 = "#CDC3B4";
const TEXT = "#1F1D19";
const TEXT_2 = "#5F584E";
const TEXT_3 = "#948A7C";
const AMBER = "#B87814";
const AMBER_BG = "#FBEFD6";
const SAGE = "#4A7040";

/* one colour per source, used everywhere that source appears */
const SRC = [
  { name: "Red", line: "#E64626", fill: "#FBDDD3", glow: "#F7B9A6" },
  { name: "Blue", line: "#2E6F9E", fill: "#D8E7F2", glow: "#A9CBE3" },
  { name: "Green", line: "#4A7A3F", fill: "#DEEBD7", glow: "#B4D3A8" },
  { name: "Purple", line: "#7A5299", fill: "#E7DCF1", glow: "#C6ADDD" },
  { name: "Amber", line: "#B87814", fill: "#F8E6C6", glow: "#EACB92" },
  { name: "Teal", line: "#2A7B72", fill: "#D4EAE7", glow: "#9BD0C9" },
];

const STOP = new Set(("a an the and or but if of to in on at for with by from as is are was were be been being this that these those it its they them their there here which who whom whose what when where how why not no nor so than then too very can will just should now also into about over under more most other some such only own same s t don").split(" "));

/* ═══════════ TEXT UTILITIES ═══════════ */
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
  const ranges = []; const re = /[\u201C\u201D][^\u201C\u201D]{6,}[\u201C\u201D]|"[^"]{6,}"/g; let m;
  while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

const contentSet = (text) =>
  new Set(tokenize(text).map((t) => norm(t.w)).filter((w) => w.length > 2 && !STOP.has(w)));

/* ═══════════ ENGINE ═══════════
   Records, for every match, where it sits in the essay AND where it came
   from in the source, so the two panes can be linked together.        */
function analyse(essay, sources, minW, ignoreQuotes) {
  const tk = tokenize(essay);
  const nz = tk.map((t) => norm(t.w));
  const n = tk.length;

  const owner = new Array(n).fill(-1);
  const srcTokAt = new Array(n).fill(-1);
  const runLen = new Array(n).fill(0);

  const srcTok = sources.map((s) => tokenize(s));
  const srcNorm = srcTok.map((ts) => ts.map((t) => norm(t.w)));

  const qr = ignoreQuotes ? quoteRanges(essay) : [];
  const inQuote = (pos) => qr.some(([a, b]) => pos >= a && pos < b);

  for (let i = 0; i < n; i++) {
    if (!nz[i] || inQuote(tk[i].s)) continue;
    for (let si = 0; si < srcNorm.length; si++) {
      const src = srcNorm[si];
      if (src.length < minW) continue;
      for (let j = 0; j <= src.length - minW; j++) {
        if (src[j] !== nz[i]) continue;
        let len = 0;
        while (i + len < n && j + len < src.length && nz[i + len] &&
               nz[i + len] === src[j + len] && !inQuote(tk[i + len].s)) len++;
        if (len < minW) continue;
        let hasContent = false;
        for (let k = 0; k < len; k++) if (!STOP.has(nz[i + k]) && nz[i + k].length > 2) hasContent = true;
        if (!hasContent) continue;
        for (let k = 0; k < len; k++) {
          if (len > runLen[i + k]) { runLen[i + k] = len; owner[i + k] = si; srcTokAt[i + k] = j + k; }
        }
      }
    }
  }

  /* group adjacent essay tokens into matches, keeping the source run contiguous */
  const matches = []; let cur = null;
  for (let i = 0; i < n; i++) {
    if (owner[i] >= 0) {
      if (cur && cur.src === owner[i] && srcTokAt[i] === cur.lastTok + 1) {
        cur.end = tk[i].e; cur.words++; cur.lastTok = srcTokAt[i];
      } else {
        if (cur) matches.push(cur);
        cur = { start: tk[i].s, end: tk[i].e, src: owner[i], words: 1, firstTok: srcTokAt[i], lastTok: srcTokAt[i] };
      }
    } else if (cur) { matches.push(cur); cur = null; }
  }
  if (cur) matches.push(cur);

  matches.forEach((m, i) => {
    m.n = i + 1;
    m.srcStart = srcTok[m.src][m.firstTok].s;
    m.srcEnd = srcTok[m.src][m.lastTok].e;
  });

  const perSource = sources.map(() => 0);
  let copied = 0;
  matches.forEach((m) => { copied += m.words; perSource[m.src] += m.words; });
  const longest = matches.reduce((a, b) => (b.words > (a ? a.words : 0) ? b : a), null);

  /* close-paraphrase detection, sentence level */
  const srcSents = [];
  sources.forEach((s, si) => splitSentences(s).forEach((r) => {
    const set = contentSet(s.slice(r.s, r.e));
    if (set.size >= 3) srcSents.push({ set, si });
  }));

  const sentences = splitSentences(essay).map((r, idx) => {
    const words = tk.filter((t) => t.s >= r.s && t.e <= r.e).length;
    const vb = matches.filter((m) => m.end > r.s && m.start < r.e).reduce((a, m) => a + m.words, 0);
    const set = contentSet(essay.slice(r.s, r.e));
    let best = 0, bestSrc = -1;
    if (set.size >= 3) {
      srcSents.forEach(({ set: ss, si }) => {
        let hit = 0; set.forEach((w) => { if (ss.has(w)) hit++; });
        const ratio = hit / set.size;
        if (ratio > best) { best = ratio; bestSrc = si; }
      });
    }
    const kind = (words ? vb / words : 0) >= 0.34 ? "verbatim" : best >= 0.62 ? "para" : "own";
    return { ...r, idx, words, kind, overlap: Math.round(best * 100), src: bestSrc };
  });

  return {
    matches, total: n, copied, perSource, longest, sentences,
    paraCount: sentences.filter((s) => s.kind === "para").length,
  };
}

function verdictFor(pct) {
  if (pct < 10) return { label: "Low", color: SAGE, msg: "Only a small amount of wording is carried over. Check that any matches are quoted and cited." };
  if (pct < 25) return { label: "Moderate", color: AMBER, msg: "Some source wording remains. Rewrite the longer highlighted passages in your own words." };
  return { label: "High", color: RED, msg: "A large share of the essay reuses source wording. This needs substantial rewriting before submission." };
}

/* ═══════════ ICONS ═══════════ */
const svg = (paths, c, s, extra) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {paths.map((d, i) => <path key={i} d={d} />)}{extra}
  </svg>
);
const I = {
  left: (c, s = 14) => svg(["M15 18l-6-6 6-6"], c, s),
  right: (c, s = 14) => svg(["M9 18l6-6-6-6"], c, s),
  doc: (c, s = 14) => svg(["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6"], c, s),
  book: (c, s = 14) => svg(["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"], c, s),
  search: (c, s = 14) => svg(["M21 21l-4.3-4.3"], c, s, <circle cx="11" cy="11" r="7" />),
  down: (c, s = 14) => svg(["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"], c, s),
  print: (c, s = 14) => svg(["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"], c, s),
  plus: (c, s = 14) => svg(["M12 5v14", "M5 12h14"], c, s),
  x: (c, s = 14) => svg(["M18 6L6 18", "M6 6l12 12"], c, s),
  back: (c, s = 14) => svg(["M19 12H5", "M12 19l-7-7 7-7"], c, s),
};

/* ═══════════ NUMBERED HIGHLIGHT ═══════════ */
function Badge({ n, color, on }) {
  return (
    <sup style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 15, height: 15, padding: "0 3px", marginLeft: 3,
      background: on ? INK : color, color: "#fff",
      fontSize: 9.5, fontWeight: 700, borderRadius: 8, verticalAlign: "super",
      fontFamily: "system-ui, sans-serif", lineHeight: 1, top: 0, position: "relative",
    }}>{n}</sup>
  );
}

/* Renders a body of text with highlighted, numbered, clickable regions. */
function MarkedText({ text, regions, sentences, activeId, onPick, idPrefix, serif }) {
  const out = [];
  let pos = 0;
  const sorted = [...regions].sort((a, b) => a.from - b.from);

  const paraRanges = (sentences || []).filter((s) => s.kind === "para");

  sorted.forEach((r, k) => {
    if (r.from < pos) return;
    if (pos < r.from) {
      const chunk = text.slice(pos, r.from);
      // tint close-paraphrase sentences that fall in unmatched text
      const bits = []; let p = pos;
      paraRanges.filter((s) => s.e > pos && s.s < r.from).forEach((s, q) => {
        const a = Math.max(s.s, pos), b = Math.min(s.e, r.from);
        if (p < a) bits.push(<span key={`x${q}`}>{text.slice(p, a)}</span>);
        bits.push(<span key={`pa${q}`} style={{ background: AMBER_BG, borderBottom: `2px dotted ${AMBER}` }}>{text.slice(a, b)}</span>);
        p = b;
      });
      if (bits.length) { if (p < r.from) bits.push(<span key="t">{text.slice(p, r.from)}</span>); out.push(<span key={`g${k}`}>{bits}</span>); }
      else out.push(<span key={`g${k}`}>{chunk}</span>);
    }
    const c = SRC[r.src % SRC.length];
    const on = activeId === r.n;
    out.push(
      <mark key={`m${k}`} id={`${idPrefix}-${r.n}`} onClick={() => onPick(r.n)}
        title={`Match ${r.n} · ${r.words} words · click to compare`}
        style={{
          background: on ? c.glow : c.fill,
          color: TEXT, borderBottom: `2px solid ${c.line}`,
          boxShadow: on ? `0 0 0 3px ${c.glow}` : "none",
          padding: "1px 0", borderRadius: 2, cursor: "pointer",
          transition: "background .2s, box-shadow .2s",
        }}>
        {text.slice(r.from, r.to)}<Badge n={r.n} color={c.line} on={on} />
      </mark>
    );
    pos = r.to;
  });

  if (pos < text.length) {
    const bits = []; let p = pos;
    paraRanges.filter((s) => s.e > pos).forEach((s, q) => {
      const a = Math.max(s.s, pos), b = s.e;
      if (p < a) bits.push(<span key={`y${q}`}>{text.slice(p, a)}</span>);
      bits.push(<span key={`pb${q}`} style={{ background: AMBER_BG, borderBottom: `2px dotted ${AMBER}` }}>{text.slice(a, b)}</span>);
      p = b;
    });
    if (p < text.length) bits.push(<span key="end">{text.slice(p)}</span>);
    out.push(<span key="tail">{bits}</span>);
  }

  return (
    <div style={{
      fontFamily: serif ? "'Source Serif 4', Georgia, serif" : "inherit",
      fontSize: serif ? 16 : 14.5, lineHeight: 1.95, whiteSpace: "pre-wrap",
      wordBreak: "break-word", color: TEXT,
    }}>{out}</div>
  );
}

const DEMO_ESSAY = `Urban green space plays a critical role in the wellbeing of city residents. Research consistently shows that access to parks reduces stress and encourages physical activity among people living in dense neighbourhoods. In my view, councils should therefore treat parkland as essential infrastructure rather than decoration.

The evidence on air quality is also strong. Trees in urban areas absorb pollutants and lower ambient temperatures during heatwaves, which matters a great deal in cities that are warming faster than surrounding regions. Some planners argue that the cost of maintaining these spaces outweighs the benefit, but this ignores the long-term savings in public health spending.

A further consideration is equity. Wealthier suburbs typically enjoy more tree cover than lower-income areas, and this uneven distribution means the benefits of green space are not shared fairly across the population.`;

const DEMO_SOURCES = [
  { name: "Chen (2021), Urban Parks", text: `Access to parks reduces stress and encourages physical activity among people living in dense neighbourhoods. Urban planners have long recognised the value of open space, though funding pressures often push it down the priority list. Provision remains uneven between wealthy and poorer districts.` },
  { name: "Okonkwo (2020), City Heat", text: `Trees in urban areas absorb pollutants and lower ambient temperatures during heatwaves. Cities are warming faster than surrounding rural regions, a phenomenon known as the urban heat island effect. Canopy cover is therefore a public health measure as much as an aesthetic one.` },
];

/* ═══════════ APP ═══════════ */
export default function App() {
  const [essay, setEssay] = useState("");
  const [sources, setSources] = useState([{ name: "", text: "" }, { name: "", text: "" }]);
  const [result, setResult] = useState(null);
  const [minW, setMinW] = useState(4);
  const [ignoreQuotes, setIgnoreQuotes] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [openSrc, setOpenSrc] = useState(0);
  const [toast, setToast] = useState(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const wc = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  const setSrc = (i, patch) => setSources((p) => p.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSrc = () => setSources((p) => (p.length >= 6 ? p : [...p, { name: "", text: "" }]));
  const delSrc = (i) => setSources((p) => (p.length <= 1 ? p : p.filter((_, j) => j !== i)));

  const run = () => {
    if (!essay.trim()) return flash("Add an essay to check");
    const used = sources.filter((s) => s.text.trim());
    if (!used.length) return flash("Add at least one source text");
    const res = analyse(essay, used.map((s) => s.text), minW, ignoreQuotes);
    res.essay = essay;
    res.srcTexts = used.map((s) => s.text);
    res.names = used.map((s, i) => s.name.trim() || `Source ${i + 1}`);
    setResult(res);
    setActiveId(res.matches.length ? 1 : null);
    setOpenSrc(res.matches.length ? res.matches[0].src : 0);
  };

  const loadDemo = () => { setEssay(DEMO_ESSAY); setSources(DEMO_SOURCES.map((s) => ({ ...s }))); flash("Example loaded — press Compare"); };

  /* selecting a match syncs both panes */
  const pick = (n) => {
    if (!result) return;
    const m = result.matches.find((x) => x.n === n);
    if (!m) return;
    setActiveId(n);
    setOpenSrc(m.src);
  };

  useEffect(() => {
    if (activeId == null) return;
    const t = setTimeout(() => {
      ["essay", "src"].forEach((p) => {
        const el = document.getElementById(`${p}-${activeId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }, 60);
    return () => clearTimeout(t);
  }, [activeId, openSrc]);

  const step = (d) => {
    if (!result || !result.matches.length) return;
    const cur = activeId || 1;
    const next = Math.min(result.matches.length, Math.max(1, cur + d));
    pick(next);
  };

  const download = () => {
    const pctv = (result.copied / result.total) * 100;
    const v = verdictFor(pctv);
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const rows = [...result.matches].sort((a, b) => b.words - a.words).map((m) =>
      `<tr><td>${m.n}</td><td>${esc(result.names[m.src])}</td><td>${m.words}</td><td>${esc(result.essay.slice(m.start, m.end))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Copy report</title><style>
body{font:14px/1.65 Georgia,serif;max-width:780px;margin:40px auto;padding:0 24px;color:#1F1D19}
h1{font-size:24px;margin:0 0 4px}.s{color:#948A7C;font-size:12px;margin-bottom:26px}
.v{background:${v.color}14;border-left:4px solid ${v.color};padding:16px 20px;margin-bottom:24px}
.b{font-size:36px;font-weight:700;line-height:1}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{text-align:left;padding:8px;border-bottom:1px solid #E3DCD1;vertical-align:top}
th{font:700 10px/1 Arial;text-transform:uppercase;letter-spacing:1px;color:#948A7C}
</style></head><body><h1>Essay copy report</h1>
<div class="s">The University of Sydney · ${new Date().toLocaleString()}</div>
<div class="v"><div class="b">${pctv.toFixed(1)}%</div><strong>${v.label} copying</strong><br>${v.msg}</div>
<p>${result.copied} of ${result.total} words match the sources word-for-word, across ${result.matches.length} passages.</p>
<h2 style="font-size:15px">Matched passages</h2>
<table><tr><th>#</th><th>Source</th><th>Words</th><th>Passage</th></tr>${rows}</table>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a"); a.href = url; a.download = "essay-copy-report.html"; a.click();
    URL.revokeObjectURL(url); flash("Report downloaded");
  };

  const pct = result ? (result.copied / result.total) * 100 : 0;
  const v = verdictFor(pct);
  const card = { background: CARD, border: `1px solid ${RULE}`, borderRadius: 4 };
  const cap = { fontSize: 10.5, letterSpacing: 1.3, fontWeight: 700, textTransform: "uppercase", color: TEXT_3 };

  return (
    <div style={{ background: PAGE, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: TEXT }}>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap');
*{box-sizing:border-box}
body{margin:0;background:${PAGE}}
::selection{background:${RED};color:#fff}
.btn{cursor:pointer;font-family:inherit;border:none;transition:filter .15s,background .15s,transform .1s}
.btn:hover{filter:brightness(1.06)}.btn:active{transform:scale(.98)}
.btn:disabled{opacity:.35;cursor:default}
.ghost{background:${CARD};border:1px solid ${RULE};color:${TEXT_2}}
.ghost:hover{background:${PAGE};border-color:${RULE_2}}
.dghost{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.2);color:#fff}
.dghost:hover{background:rgba(255,255,255,.18)}
button:focus-visible,input:focus-visible,textarea:focus-visible,mark:focus-visible{outline:2px solid ${RED};outline-offset:2px}
textarea,input{font-family:inherit}
textarea:focus{outline:none;background:#FFFDFA}
textarea::placeholder{color:${TEXT_3}}
.stab{background:transparent;border:none;border-bottom:3px solid transparent;padding:11px 14px;font:600 12.5px/1 inherit;color:${TEXT_3};cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;transition:color .15s,border-color .15s}
.stab:hover{color:${TEXT}}
.pane{overflow-y:auto;padding:26px 30px}
.pane::-webkit-scrollbar{width:9px}
.pane::-webkit-scrollbar-thumb{background:${RULE_2};border-radius:5px}
.pane::-webkit-scrollbar-track{background:${PAGE}}
.rise{animation:rise .45s cubic-bezier(.16,1,.3,1) both}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.pop{animation:pop .3s cubic-bezier(.34,1.4,.64,1) both}
@keyframes pop{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
.wrap{max-width:1400px;margin:0 auto;padding:0 26px}
.setup{display:grid;grid-template-columns:1.1fr .9fr;gap:20px}
.compare{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.panes{height:calc(100vh - 300px);min-height:420px}
@media(max-width:940px){
.wrap{padding:0 14px}
.setup,.compare{grid-template-columns:1fr}
.panes{height:auto}
.pane{max-height:56vh}
.hide-sm{display:none}
}
@media print{.noprint{display:none!important}body{background:#fff}.pane{max-height:none;overflow:visible}.panes{height:auto}}
`}</style>

      {/* ─── header ─── */}
      <header style={{ background: INK, color: "#fff" }}>
        <div className="wrap" style={{ padding: "16px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <span style={{ width: 4, height: 32, background: RED, display: "block", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 9.5, letterSpacing: 2, color: "rgba(255,255,255,.5)", fontWeight: 600 }}>THE UNIVERSITY OF SYDNEY</div>
              <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 21, fontWeight: 600, marginTop: 2 }}>Essay Copy Detector</div>
            </div>
          </div>
          {result ? (
            <div className="noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn dghost" onClick={download} style={{ padding: "9px 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, borderRadius: 3 }}>
                {I.down("#fff", 13)} Report
              </button>
              <button className="btn dghost" onClick={() => window.print()} style={{ padding: "9px 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, borderRadius: 3 }}>
                {I.print("#fff", 13)} Print
              </button>
              <button className="btn" onClick={() => { setResult(null); setActiveId(null); }}
                style={{ background: RED, color: "#fff", padding: "9px 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, borderRadius: 3 }}>
                {I.back("#fff", 13)} Edit texts
              </button>
            </div>
          ) : (
            <button className="btn dghost noprint" onClick={loadDemo} style={{ padding: "9px 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, borderRadius: 3 }}>
              {I.book("#fff", 13)} Load example
            </button>
          )}
        </div>
      </header>

      {/* ══════════ SETUP ══════════ */}
      {!result && (
        <main className="wrap rise" style={{ padding: "24px 26px 44px" }}>
          <p style={{ fontSize: 15, color: TEXT_2, margin: "0 0 22px", maxWidth: 620, lineHeight: 1.6 }}>
            Paste the essay on the left and the readings it drew on for the right. You will then see both side by side, with every copied phrase highlighted and numbered so you can compare them directly.
          </p>

          <div className="setup">
            <section style={{ ...card, display: "flex", flexDirection: "column", minHeight: 400 }}>
              <div style={{ padding: "13px 18px", borderBottom: `1px solid ${RULE}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...cap, color: TEXT, display: "flex", alignItems: "center", gap: 8 }}>{I.doc(TEXT, 14)} The essay</span>
                <span style={{ fontSize: 12, color: TEXT_3 }}>{wc(essay)} words</span>
              </div>
              <textarea value={essay} onChange={(e) => setEssay(e.target.value)}
                placeholder="Paste the essay here…"
                style={{ flex: 1, width: "100%", padding: "20px 22px", border: "none", resize: "none", fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 15.5, lineHeight: 1.75, color: TEXT, background: "transparent", borderRadius: 4 }} />
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...cap, color: TEXT, display: "flex", alignItems: "center", gap: 8 }}>{I.book(TEXT, 14)} Source readings</span>
                <button className="btn ghost noprint" onClick={addSrc} disabled={sources.length >= 6}
                  style={{ padding: "6px 11px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, borderRadius: 3 }}>
                  {I.plus(TEXT_2, 13)} Add source
                </button>
              </div>

              {sources.map((s, i) => (
                <div key={i} style={{ ...card, display: "flex", flexDirection: "column", flex: 1, minHeight: 120, borderLeft: `4px solid ${SRC[i % SRC.length].line}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${RULE}` }}>
                    <input value={s.name} onChange={(e) => setSrc(i, { name: e.target.value })}
                      placeholder={`Source ${i + 1} — give it a name`}
                      aria-label={`Name for source ${i + 1}`}
                      style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: TEXT, padding: "4px 2px", outline: "none", minWidth: 0 }} />
                    <span style={{ fontSize: 11.5, color: TEXT_3, whiteSpace: "nowrap" }}>{wc(s.text)} words</span>
                    {sources.length > 1 && (
                      <button className="btn noprint" onClick={() => delSrc(i)} aria-label={`Remove source ${i + 1}`}
                        style={{ background: "transparent", padding: 4, lineHeight: 0 }}>{I.x(TEXT_3, 14)}</button>
                    )}
                  </div>
                  <textarea value={s.text} onChange={(e) => setSrc(i, { text: e.target.value })}
                    placeholder="Paste this reading here…"
                    style={{ flex: 1, width: "100%", padding: "13px 16px", border: "none", resize: "none", fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13.5, lineHeight: 1.7, color: TEXT, background: "transparent" }} />
                </div>
              ))}
            </section>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ ...card, padding: "10px 15px", display: "flex", alignItems: "center", gap: 10 }}>
              <label htmlFor="mw" style={{ fontSize: 13, color: TEXT_2 }}>Highlight runs of</label>
              <input id="mw" type="number" min="3" max="12" value={minW}
                onChange={(e) => setMinW(Math.min(12, Math.max(3, parseInt(e.target.value) || 3)))}
                style={{ width: 50, padding: "6px 8px", border: `1px solid ${RULE}`, fontSize: 13.5, textAlign: "center", borderRadius: 3 }} />
              <span style={{ fontSize: 13, color: TEXT_2 }}>words or more</span>
            </div>
            <label style={{ ...card, padding: "11px 15px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13, color: TEXT_2 }}>
              <input type="checkbox" checked={ignoreQuotes} onChange={(e) => setIgnoreQuotes(e.target.checked)}
                style={{ accentColor: RED, width: 15, height: 15 }} />
              Ignore anything in quotation marks
            </label>
            <button className="btn" onClick={run}
              style={{ background: RED, color: "#fff", padding: "14px 32px", fontSize: 13.5, fontWeight: 700, flex: 1, minWidth: 220, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 3 }}>
              {I.search("#fff", 16)} Compare essay with sources
            </button>
          </div>
        </main>
      )}

      {/* ══════════ COMPARE ══════════ */}
      {result && (
        <main className="rise">
          {/* summary strip */}
          <section style={{ background: CARD, borderBottom: `1px solid ${RULE}` }}>
            <div className="wrap" style={{ padding: "20px 26px", display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 46, fontWeight: 600, color: v.color, lineHeight: 1 }}>
                  {pct.toFixed(1)}%
                </span>
                <span style={{ background: v.color, color: "#fff", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, padding: "4px 10px", textTransform: "uppercase", borderRadius: 2 }}>
                  {v.label}
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 14.5, color: TEXT, marginBottom: 9, lineHeight: 1.5 }}>
                  <strong>{result.copied}</strong> of <strong>{result.total}</strong> words are copied word-for-word,
                  in <strong>{result.matches.length}</strong> highlighted {result.matches.length === 1 ? "passage" : "passages"}.
                </div>
                <div style={{ display: "flex", height: 12, borderRadius: 2, overflow: "hidden", border: `1px solid ${RULE}` }}>
                  {result.perSource.map((w, i) => w > 0 ? (
                    <div key={i} title={`${result.names[i]}: ${w} words`}
                      style={{ width: `${(w / result.total) * 100}%`, background: SRC[i % SRC.length].line, transition: "width .8s cubic-bezier(.16,1,.3,1)" }} />
                  ) : null)}
                  <div style={{ flex: 1, background: PAGE }} />
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", fontSize: 12, color: TEXT_2 }}>
                  {result.perSource.map((w, i) => w > 0 ? (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, background: SRC[i % SRC.length].line, borderRadius: 2 }} />
                      {result.names[i]} — {((w / result.total) * 100).toFixed(1)}%
                    </span>
                  ) : null)}
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, background: PAGE, border: `1px solid ${RULE_2}`, borderRadius: 2 }} />
                    Student's own — {(100 - pct).toFixed(1)}%
                  </span>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: 13.5, color: TEXT_2, maxWidth: 300, lineHeight: 1.6, borderLeft: `3px solid ${v.color}`, paddingLeft: 14 }}>
                {v.msg}
              </p>
            </div>
          </section>

          {/* match navigator */}
          <section className="noprint" style={{ background: INK_2, color: "#fff" }}>
            <div className="wrap" style={{ padding: "11px 26px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.72)" }}>
                {result.matches.length ? "Step through each copied passage — both panels move together" : "No copied passages found"}
              </span>
              {result.matches.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  <button className="btn dghost" onClick={() => step(-1)} disabled={(activeId || 1) <= 1}
                    aria-label="Previous match" style={{ padding: "7px 11px", borderRadius: 3, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                    {I.left("#fff", 13)} <span className="hide-sm">Previous</span>
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 118, textAlign: "center" }}>
                    Match {activeId || 1} of {result.matches.length}
                  </span>
                  <button className="btn dghost" onClick={() => step(1)} disabled={(activeId || 1) >= result.matches.length}
                    aria-label="Next match" style={{ padding: "7px 11px", borderRadius: 3, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                    <span className="hide-sm">Next</span> {I.right("#fff", 13)}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* the two panels */}
          <div className="wrap" style={{ padding: "18px 26px 40px" }}>
            <div className="compare panes">
              {/* essay */}
              <section style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${RULE}`, background: CARD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ ...cap, color: TEXT, display: "flex", alignItems: "center", gap: 8 }}>{I.doc(TEXT, 14)} The essay</span>
                  <span style={{ fontSize: 12, color: TEXT_3 }}>{result.total} words</span>
                </div>
                <div className="pane" style={{ flex: 1 }}>
                  <MarkedText serif idPrefix="essay" text={result.essay}
                    regions={result.matches.map((m) => ({ n: m.n, from: m.start, to: m.end, src: m.src, words: m.words }))}
                    sentences={result.sentences} activeId={activeId} onPick={pick} />
                </div>
              </section>

              {/* sources */}
              <section style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ borderBottom: `1px solid ${RULE}`, display: "flex", overflowX: "auto" }}>
                  {result.names.map((nm, i) => {
                    const c = SRC[i % SRC.length];
                    const cnt = result.matches.filter((m) => m.src === i).length;
                    const on = openSrc === i;
                    return (
                      <button key={i} className="stab" onClick={() => setOpenSrc(i)}
                        style={{ borderBottomColor: on ? c.line : "transparent", color: on ? TEXT : TEXT_3, background: on ? c.fill + "55" : "transparent" }}>
                        <span style={{ width: 10, height: 10, background: c.line, borderRadius: 2, flexShrink: 0 }} />
                        {nm}
                        <span style={{ background: on ? c.line : RULE, color: on ? "#fff" : TEXT_3, fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 8 }}>{cnt}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="pane" style={{ flex: 1 }}>
                  <MarkedText serif idPrefix="src" text={result.srcTexts[openSrc] || ""}
                    regions={result.matches.filter((m) => m.src === openSrc)
                      .map((m) => ({ n: m.n, from: m.srcStart, to: m.srcEnd, src: m.src, words: m.words }))}
                    activeId={activeId} onPick={pick} />
                </div>
              </section>
            </div>

            {/* legend */}
            <div style={{ ...card, marginTop: 16, padding: "13px 20px", display: "flex", gap: 26, flexWrap: "wrap", fontSize: 12.5, color: TEXT_2, alignItems: "center" }}>
              <span style={{ ...cap }}>How to read this</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: SRC[0].fill, borderBottom: `2px solid ${SRC[0].line}`, padding: "2px 9px", borderRadius: 2 }}>highlighted</span>
                copied word-for-word — the number links it to the source
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: AMBER_BG, borderBottom: `2px dotted ${AMBER}`, padding: "2px 9px" }}>dotted</span>
                same idea, reworded closely ({result.paraCount} {result.paraCount === 1 ? "sentence" : "sentences"})
              </span>
            </div>
          </div>
        </main>
      )}

      <footer style={{ background: INK, color: "rgba(255,255,255,.45)" }}>
        <div className="wrap" style={{ padding: "18px 26px", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
          <span>© The University of Sydney · Essay Copy Detector</span>
          <span>Runs entirely in your browser. No text is uploaded or stored.</span>
        </div>
      </footer>

      {toast && (
        <div className="pop" style={{ position: "fixed", bottom: 26, left: "50%", background: INK, color: "#fff", padding: "12px 22px", fontSize: 13, fontWeight: 500, zIndex: 60, boxShadow: "0 8px 30px rgba(0,0,0,.3)", borderRadius: 3 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
