import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";

/* ═══════════ PALETTE — library cloth, paper, marking inks ═══════════ */
const GROUND = "#E8EBE4";
const GROUND_2 = "#DFE3D9";
const PAPER = "#FCFCFA";
const RULE = "#D7DBD1";
const RULE_2 = "#BFC5B8";
const INK = "#22291F";
const TEXT = "#1C1F1A";
const TEXT_2 = "#565C50";
const TEXT_3 = "#8A9082";
const RED = "#E64626";
const PARA_LINE = "#6E7A5E";
const PARA_FILL = "#EDF0E6";

/* one marking ink per reading, used wherever that reading appears */
const INKS = [
  { line: "#E64626", fill: "#FBDCD2", glow: "#F6B5A2" },
  { line: "#2B5C8A", fill: "#D8E4EF", glow: "#A8C4DC" },
  { line: "#17706A", fill: "#D4E7E4", glow: "#9CCCC6" },
  { line: "#6B4A94", fill: "#E3DAF0", glow: "#BFA8DC" },
  { line: "#A87410", fill: "#F5E5C6", glow: "#E3C489" },
  { line: "#8E3552", fill: "#F2D9E1", glow: "#DBA9BB" },
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

/* ═══════════ ENGINE ═══════════ */
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
  if (pct < 10) return { label: "Lightly borrowed", color: "#3F6B39", msg: "Very little wording is carried over. Check that anything highlighted is quoted and cited." };
  if (pct < 25) return { label: "Moderately borrowed", color: "#A87410", msg: "Some source wording remains. Rewrite the longer highlighted passages in your own words." };
  return { label: "Heavily borrowed", color: RED, msg: "Much of this essay reuses source wording. It needs substantial rewriting before you submit it." };
}

/* ═══════════ ICONS ═══════════ */
const svg = (paths, c, s, extra) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {paths.map((d, i) => <path key={i} d={d} />)}{extra}
  </svg>
);
const I = {
  up: (c, s = 14) => svg(["M18 15l-6-6-6 6"], c, s),
  down: (c, s = 14) => svg(["M6 9l6 6 6-6"], c, s),
  save: (c, s = 14) => svg(["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"], c, s),
  print: (c, s = 14) => svg(["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"], c, s),
  plus: (c, s = 14) => svg(["M12 5v14", "M5 12h14"], c, s),
  x: (c, s = 14) => svg(["M18 6L6 18", "M6 6l12 12"], c, s),
  back: (c, s = 14) => svg(["M19 12H5", "M12 19l-7-7 7-7"], c, s),
};

/* ═══════════ MARKED TEXT ═══════════ */
function MarkedText({ text, regions, sentences, activeId, onPick, pane }) {
  const out = [];
  let pos = 0;
  /* two essay matches can trace to one stretch of source: merge and keep both numbers */
  const sorted = [];
  [...regions].sort((a, b) => a.from - b.from).forEach((r) => {
    const last = sorted[sorted.length - 1];
    if (last && r.from < last.to) {
      last.to = Math.max(last.to, r.to);
      last.ns.push(r.n);
      last.words = Math.max(last.words, r.words);
    } else {
      sorted.push({ from: r.from, to: r.to, src: r.src, ns: [r.n], words: r.words });
    }
  });
  const paras = (sentences || []).filter((s) => s.kind === "para");

  const plain = (from, to, key) => {
    const bits = []; let p = from;
    paras.filter((s) => s.e > from && s.s < to).forEach((s, q) => {
      const a = Math.max(s.s, from), b = Math.min(s.e, to);
      if (p < a) bits.push(<span key={`a${q}`}>{text.slice(p, a)}</span>);
      bits.push(<span key={`b${q}`} style={{ background: PARA_FILL, borderBottom: `1.5px dotted ${PARA_LINE}` }}>{text.slice(a, b)}</span>);
      p = b;
    });
    if (p < to) bits.push(<span key="t">{text.slice(p, to)}</span>);
    return <span key={key}>{bits}</span>;
  };

  sorted.forEach((r, k) => {
    if (pos < r.from) out.push(plain(pos, r.from, `g${k}`));
    const c = INKS[r.src % INKS.length];
    const on = r.ns.includes(activeId);
    const label = r.ns.join(",");
    out.push(
      <mark key={`m${k}`} data-pane={pane} data-marks={r.ns.join(" ")} onClick={() => onPick(r.ns[0])}
        title={r.ns.length > 1 ? `Matches ${label}` : `Match ${label}, ${r.words} words`}
        style={{
          background: on ? c.glow : c.fill,
          color: TEXT,
          borderBottom: `2px solid ${c.line}`,
          padding: "1px 0", borderRadius: 1, cursor: "pointer",
          transition: "background .22s ease",
        }}>
        {text.slice(r.from, r.to)}
        <sup style={{ color: c.line, fontFamily: "'Instrument Sans', system-ui, sans-serif",
                      fontSize: 10, fontWeight: 700, marginLeft: 2, letterSpacing: .2 }}>{label}</sup>
      </mark>
    );
    pos = r.to;
  });
  if (pos < text.length) out.push(plain(pos, text.length, "tail"));

  return (
    <div style={{
      fontFamily: "'Newsreader', Georgia, serif", fontSize: 17.5, lineHeight: 1.85,
      whiteSpace: "pre-wrap", wordBreak: "break-word", color: TEXT, maxWidth: "68ch",
    }}>{out}</div>
  );
}

/* ═══════════ COLUMN MAP — the essay as a vertical strip ═══════════ */
function ColumnMap({ result, activeId, onPick }) {
  const H = 260, W = 34;
  const len = result.essay.length || 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}
         role="img" aria-label="Map of the essay showing where matches fall">
      <rect x="0" y="0" width={W} height={H} fill={PAPER} stroke={RULE} />
      {result.sentences.filter((s) => s.kind === "para").map((s, i) => (
        <rect key={`p${i}`} x="1" y={(s.s / len) * H} width={W - 2}
              height={Math.max(((s.e - s.s) / len) * H, 1)} fill={PARA_FILL} />
      ))}
      {result.matches.map((m) => {
        const c = INKS[m.src % INKS.length];
        const y = (m.start / len) * H;
        const h = Math.max(((m.end - m.start) / len) * H, 2.5);
        const on = activeId === m.n;
        return (
          <g key={m.n} onClick={() => onPick(m.n)} style={{ cursor: "pointer" }}>
            <rect x="-3" y={y - 2} width={W + 6} height={h + 4} fill="transparent" />
            <rect x="1" y={y} width={W - 2} height={h} fill={c.line} opacity={on ? 1 : 0.72} />
            {on && <rect x="-3" y={y - 1.5} width={W + 6} height={h + 3} fill="none" stroke={INK} strokeWidth="1.5" />}
            <title>{`Match ${m.n}, ${m.words} words`}</title>
          </g>
        );
      })}
    </svg>
  );
}

const markEl = (pane, n) =>
  document.querySelector(`[data-pane="${pane}"][data-marks~="${n}"]`);

const DEMO_ESSAY = `Urban green space plays a critical role in the wellbeing of city residents. Research consistently shows that access to parks reduces stress and encourages physical activity among people living in dense neighbourhoods. In my view, councils should therefore treat parkland as essential infrastructure rather than decoration.

The evidence on air quality is also strong. Trees in urban areas absorb pollutants and lower ambient temperatures during heatwaves, which matters a great deal in cities that are warming faster than surrounding regions. Some planners argue that the cost of maintaining these spaces outweighs the benefit, but this ignores the long-term savings in public health spending.

A further consideration is equity. Wealthier suburbs typically enjoy more tree cover than lower-income areas, and this uneven distribution means the benefits of green space are not shared fairly across the population.`;

const DEMO_SOURCES = [
  { name: "Chen, Urban Parks (2021)", text: `Access to parks reduces stress and encourages physical activity among people living in dense neighbourhoods. Urban planners have long recognised the value of open space, though funding pressures often push it down the priority list. Provision remains uneven between wealthy and poorer districts.` },
  { name: "Okonkwo, City Heat (2020)", text: `Trees in urban areas absorb pollutants and lower ambient temperatures during heatwaves. Cities are warming faster than surrounding rural regions, a phenomenon known as the urban heat island effect. Canopy cover is therefore a public health measure as much as an aesthetic one.` },
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
  const [note, setNote] = useState(null);
  const [thread, setThread] = useState(null);

  const pagesRef = useRef(null);
  const leafL = useRef(null);
  const leafR = useRef(null);
  const lastThread = useRef(null);

  const putThread = (t) => {
    const a = lastThread.current;
    if (a === t) return;
    if (a && t && Math.abs(a.x1 - t.x1) < .5 && Math.abs(a.y1 - t.y1) < .5 &&
        Math.abs(a.x2 - t.x2) < .5 && Math.abs(a.y2 - t.y2) < .5 &&
        a.offA === t.offA && a.offB === t.offB) return;
    lastThread.current = t;
    setThread(t);
  };

  const say = (m) => { setNote(m); setTimeout(() => setNote(null), 2200); };
  const wc = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  const setSrc = (i, patch) => setSources((p) => p.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSrc = () => setSources((p) => (p.length >= 6 ? p : [...p, { name: "", text: "" }]));
  const delSrc = (i) => setSources((p) => (p.length <= 1 ? p : p.filter((_, j) => j !== i)));

  const findMatches = () => {
    if (!essay.trim()) return say("Paste an essay first");
    const used = sources.filter((s) => s.text.trim());
    if (!used.length) return say("Paste at least one reading");
    const res = analyse(essay, used.map((s) => s.text), minW, ignoreQuotes);
    res.essay = essay;
    res.srcTexts = used.map((s) => s.text);
    res.names = used.map((s, i) => s.name.trim() || `Reading ${i + 1}`);
    setResult(res);
    setActiveId(res.matches.length ? 1 : null);
    setOpenSrc(res.matches.length ? res.matches[0].src : 0);
  };

  const tryExample = () => {
    setEssay(DEMO_ESSAY);
    setSources(DEMO_SOURCES.map((s) => ({ ...s })));
    say("Example loaded");
  };

  const pick = (n) => {
    if (!result) return;
    const m = result.matches.find((x) => x.n === n);
    if (!m) return;
    setActiveId(n);
    setOpenSrc(m.src);
  };

  const step = (d) => {
    if (!result || !result.matches.length) return;
    const next = Math.min(result.matches.length, Math.max(1, (activeId || 1) + d));
    pick(next);
  };

  /* scroll both leaves to the selected match */
  useEffect(() => {
    if (activeId == null) return;
    const t = setTimeout(() => {
      ["essay", "src"].forEach((p) => {
        const el = markEl(p, activeId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }, 50);
    return () => clearTimeout(t);
  }, [activeId, openSrc]);

  /* ── the thread across the gutter ── */
  const drawThread = useCallback(() => {
    const box = pagesRef.current, L = leafL.current, R = leafR.current;
    if (!box || !L || !R || activeId == null || window.innerWidth < 1000) { putThread(null); return; }
    const a = markEl("essay", activeId);
    const b = markEl("src", activeId);
    if (!a || !b) { putThread(null); return; }
    const B = box.getBoundingClientRect();
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const pa = L.getBoundingClientRect(), pb = R.getBoundingClientRect();
    const clampY = (y, p) => Math.min(Math.max(y, p.top + 10), p.bottom - 10);
    const yaRaw = ra.top + ra.height / 2, ybRaw = rb.top + rb.height / 2;
    putThread({
      x1: pa.right - B.left, y1: clampY(yaRaw, pa) - B.top,
      x2: pb.left - B.left, y2: clampY(ybRaw, pb) - B.top,
      offA: yaRaw < pa.top + 10 ? -1 : yaRaw > pa.bottom - 10 ? 1 : 0,
      offB: ybRaw < pb.top + 10 ? -1 : ybRaw > pb.bottom - 10 ? 1 : 0,
    });
  }, [activeId]);

  useLayoutEffect(() => {
    drawThread();
    const L = leafL.current, R = leafR.current;
    const onAny = () => drawThread();
    let raf; const loop = () => { drawThread(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const stop = setTimeout(() => cancelAnimationFrame(raf), 900);
    L && L.addEventListener("scroll", onAny, { passive: true });
    R && R.addEventListener("scroll", onAny, { passive: true });
    window.addEventListener("resize", onAny);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(stop);
      L && L.removeEventListener("scroll", onAny);
      R && R.removeEventListener("scroll", onAny);
      window.removeEventListener("resize", onAny);
    };
  }, [drawThread, openSrc, result]);

  const saveReport = () => {
    const pctv = (result.copied / result.total) * 100;
    const v = verdictFor(pctv);
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const rows = [...result.matches].sort((a, b) => b.words - a.words).map((m) =>
      `<tr><td>${m.n}</td><td>${esc(result.names[m.src])}</td><td>${m.words}</td><td>${esc(result.essay.slice(m.start, m.end))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Copy report</title><style>
body{font:15px/1.75 Georgia,serif;max-width:760px;margin:48px auto;padding:0 26px;color:#1C1F1A}
h1{font-size:25px;margin:0 0 6px;font-weight:600}
.s{color:#8A9082;font-size:13px;margin-bottom:30px}
.v{border-left:3px solid ${v.color};padding:4px 0 4px 18px;margin-bottom:26px}
.v b{font-size:19px;color:${v.color}}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #D7DBD1;vertical-align:top}
th{font:600 12px/1 Georgia,serif;color:#8A9082}
</style></head><body><h1>Essay copy report</h1>
<div class="s">The University of Sydney, ${new Date().toLocaleString()}</div>
<div class="v"><b>${pctv.toFixed(1)}% ${v.label.toLowerCase()}</b><br>${v.msg}</div>
<p>${result.copied} of ${result.total} words match the readings word for word, across ${result.matches.length} passages.</p>
<h2 style="font-size:16px;font-weight:600">Matched passages</h2>
<table><tr><th>No.</th><th>Reading</th><th>Words</th><th>Passage</th></tr>${rows}</table>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a"); a.href = url; a.download = "essay-copy-report.html"; a.click();
    URL.revokeObjectURL(url); say("Report saved");
  };

  const pct = result ? (result.copied / result.total) * 100 : 0;
  const v = verdictFor(pct);
  const leaf = { background: PAPER, border: `1px solid ${RULE}`, boxShadow: "0 1px 1px rgba(34,41,31,.04), 0 14px 30px -20px rgba(34,41,31,.30)" };

  return (
    <div style={{ background: GROUND, minHeight: "100vh", fontFamily: "'Instrument Sans', system-ui, sans-serif", color: TEXT }}>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Instrument+Sans:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
body{margin:0;background:${GROUND}}
::selection{background:${RED};color:#fff}
.btn{cursor:pointer;font-family:inherit;border:none;transition:background .15s,color .15s,border-color .15s}
.btn:disabled{opacity:.32;cursor:default}
.quiet{background:transparent;border:1px solid ${RULE_2};color:${TEXT_2}}
.quiet:hover:not(:disabled){background:${PAPER};border-color:${TEXT_3}}
.onink{background:transparent;border:1px solid rgba(255,255,255,.24);color:rgba(255,255,255,.92)}
.onink:hover:not(:disabled){background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.45)}
button:focus-visible,input:focus-visible,textarea:focus-visible,mark:focus-visible{outline:2px solid ${RED};outline-offset:2px}
textarea,input{font-family:inherit}
textarea:focus{outline:none}
textarea::placeholder{color:${TEXT_3}}
.leaf{overflow-y:auto;padding:32px 38px 44px}
.leaf::-webkit-scrollbar{width:10px}
.leaf::-webkit-scrollbar-thumb{background:${RULE_2}}
.leaf::-webkit-scrollbar-track{background:${GROUND_2}}
.tab{background:transparent;border:none;border-bottom:2px solid transparent;padding:12px 16px;font:500 13.5px/1 inherit;color:${TEXT_3};cursor:pointer;display:flex;align-items:center;gap:9px;white-space:nowrap;transition:color .15s,border-color .15s}
.tab:hover{color:${TEXT}}
.shell{max-width:1460px;margin:0 auto;padding:0 30px}
.setup{display:grid;grid-template-columns:1.08fr .92fr;gap:26px}
.spread{display:grid;grid-template-columns:212px 1fr;gap:34px;align-items:start}
.pages{display:grid;grid-template-columns:1fr 1fr;gap:58px;position:relative}
.tall{height:calc(100vh - 190px);min-height:460px}
@media(max-width:1180px){.spread{grid-template-columns:180px 1fr}.pages{gap:34px}}
@media(max-width:1000px){
.shell{padding:0 16px}
.setup,.spread,.pages{grid-template-columns:1fr;gap:20px}
.tall{height:auto}
.leaf{max-height:54vh;padding:24px 22px 30px}
.stack{flex-direction:row!important;flex-wrap:wrap;gap:26px;align-items:flex-start}
}
@media print{.noprint{display:none!important}body{background:#fff}.leaf{max-height:none;overflow:visible}.tall{height:auto}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`}</style>

      {/* ── masthead ── */}
      <header style={{ background: INK, color: "#fff", borderBottom: `3px solid ${RED}` }}>
        <div className="shell" style={{ padding: "18px 30px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 25, fontWeight: 500, letterSpacing: -0.2 }}>
              Essay Copy Detector
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
              The University of Sydney
            </div>
          </div>
          {result ? (
            <div className="noprint" style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <button className="btn onink" onClick={saveReport} style={{ padding: "9px 15px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, borderRadius: 3 }}>
                {I.save("rgba(255,255,255,.9)", 14)} Save report
              </button>
              <button className="btn onink" onClick={() => window.print()} style={{ padding: "9px 15px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, borderRadius: 3 }}>
                {I.print("rgba(255,255,255,.9)", 14)} Print
              </button>
              <button className="btn" onClick={() => { setResult(null); setActiveId(null); setThread(null); }}
                style={{ background: RED, color: "#fff", padding: "9px 15px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, borderRadius: 3 }}>
                {I.back("#fff", 14)} Back to texts
              </button>
            </div>
          ) : (
            <button className="btn onink noprint" onClick={tryExample} style={{ padding: "9px 15px", fontSize: 13, fontWeight: 500, borderRadius: 3 }}>
              Try an example
            </button>
          )}
        </div>
      </header>

      {/* ══════════ SETUP ══════════ */}
      {!result && (
        <main className="shell" style={{ padding: "30px 30px 52px" }}>
          <p style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 19, lineHeight: 1.65, color: TEXT_2, margin: "0 0 28px", maxWidth: "58ch" }}>
            Put the essay beside the readings it drew on. Every phrase carried over word for word is marked in both, so you can see exactly what was borrowed and what was written.
          </p>

          <div className="setup">
            <section style={{ ...leaf, display: "flex", flexDirection: "column", minHeight: 420, borderRadius: 3 }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${RULE}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 17, fontWeight: 500 }}>The essay</span>
                <span style={{ fontSize: 12.5, color: TEXT_3 }}>{wc(essay)} words</span>
              </div>
              <textarea value={essay} onChange={(e) => setEssay(e.target.value)}
                placeholder="Paste the essay here"
                style={{ flex: 1, width: "100%", padding: "22px 24px", border: "none", resize: "none", fontFamily: "'Newsreader', Georgia, serif", fontSize: 16.5, lineHeight: 1.8, color: TEXT, background: "transparent" }} />
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 17, fontWeight: 500 }}>The readings</span>
                <button className="btn quiet noprint" onClick={addSrc} disabled={sources.length >= 6}
                  style={{ padding: "7px 12px", fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 7, borderRadius: 3, background: PAPER }}>
                  {I.plus(TEXT_2, 13)} Add a reading
                </button>
              </div>

              {sources.map((s, i) => (
                <div key={i} style={{ ...leaf, display: "flex", flexDirection: "column", flex: 1, minHeight: 128, borderRadius: 3, borderLeft: `4px solid ${INKS[i % INKS.length].line}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${RULE}` }}>
                    <input value={s.name} onChange={(e) => setSrc(i, { name: e.target.value })}
                      placeholder={`Reading ${i + 1}, give it a name`}
                      aria-label={`Name of reading ${i + 1}`}
                      style={{ flex: 1, border: "none", background: "transparent", fontSize: 13.5, fontWeight: 500, color: TEXT, padding: "4px 2px", outline: "none", minWidth: 0 }} />
                    <span style={{ fontSize: 12, color: TEXT_3, whiteSpace: "nowrap" }}>{wc(s.text)} words</span>
                    {sources.length > 1 && (
                      <button className="btn noprint" onClick={() => delSrc(i)} aria-label={`Remove reading ${i + 1}`}
                        style={{ background: "transparent", padding: 4, lineHeight: 0 }}>{I.x(TEXT_3, 15)}</button>
                    )}
                  </div>
                  <textarea value={s.text} onChange={(e) => setSrc(i, { text: e.target.value })}
                    placeholder="Paste this reading here"
                    style={{ flex: 1, width: "100%", padding: "14px 18px", border: "none", resize: "none", fontFamily: "'Newsreader', Georgia, serif", fontSize: 14.5, lineHeight: 1.75, color: TEXT, background: "transparent" }} />
                </div>
              ))}
            </section>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: TEXT_2 }}>
              <label htmlFor="mw">Mark runs of</label>
              <input id="mw" type="number" min="3" max="12" value={minW}
                onChange={(e) => setMinW(Math.min(12, Math.max(3, parseInt(e.target.value) || 3)))}
                style={{ width: 52, padding: "7px 8px", border: `1px solid ${RULE_2}`, fontSize: 14, textAlign: "center", borderRadius: 3, background: PAPER }} />
              <span>words or longer</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13.5, color: TEXT_2 }}>
              <input type="checkbox" checked={ignoreQuotes} onChange={(e) => setIgnoreQuotes(e.target.checked)}
                style={{ accentColor: RED, width: 16, height: 16 }} />
              Skip anything inside quotation marks
            </label>
            <button className="btn" onClick={findMatches}
              style={{ background: RED, color: "#fff", padding: "15px 34px", fontSize: 14.5, fontWeight: 600, marginLeft: "auto", borderRadius: 3 }}>
              Find matches
            </button>
          </div>
        </main>
      )}

      {/* ══════════ THE SPREAD ══════════ */}
      {result && (
        <main className="shell" style={{ padding: "26px 30px 44px" }}>
          <div className="spread">

            {/* ── apparatus margin ── */}
            <aside className="stack" style={{ position: "sticky", top: 26, display: "flex", flexDirection: "column", gap: 26 }}>
              <div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <ColumnMap result={result} activeId={activeId} onPick={pick} />
                  <div>
                    <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 34, fontWeight: 500, lineHeight: 1, color: v.color }}>
                      {pct.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 13, color: v.color, fontWeight: 600, marginTop: 5, lineHeight: 1.3 }}>{v.label}</div>
                    <div style={{ fontSize: 12.5, color: TEXT_2, marginTop: 10, lineHeight: 1.55 }}>
                      {result.copied} of {result.total} words<br />in {result.matches.length} {result.matches.length === 1 ? "passage" : "passages"}
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.6, margin: "18px 0 0", paddingTop: 16, borderTop: `1px solid ${RULE_2}` }}>
                  {v.msg}
                </p>
              </div>

              <div style={{ flex: 1, minWidth: 168 }}>
                {result.matches.length > 0 && (
                  <div className="noprint" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                    <button className="btn quiet" onClick={() => step(-1)} disabled={(activeId || 1) <= 1}
                      aria-label="Previous match" style={{ padding: "8px 10px", borderRadius: 3, lineHeight: 0, background: PAPER }}>
                      {I.up(TEXT_2, 15)}
                    </button>
                    <span style={{ fontSize: 13, color: TEXT_2, flex: 1, textAlign: "center" }}>
                      Match {activeId || 1} of {result.matches.length}
                    </span>
                    <button className="btn quiet" onClick={() => step(1)} disabled={(activeId || 1) >= result.matches.length}
                      aria-label="Next match" style={{ padding: "8px 10px", borderRadius: 3, lineHeight: 0, background: PAPER }}>
                      {I.down(TEXT_2, 15)}
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {result.perSource.map((w, i) => w > 0 ? (
                    <button key={i} className="btn" onClick={() => setOpenSrc(i)}
                      style={{ background: "transparent", padding: 0, textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start", fontFamily: "inherit" }}>
                      <span style={{ width: 3, alignSelf: "stretch", background: INKS[i % INKS.length].line, flexShrink: 0, marginTop: 2 }} />
                      <span>
                        <span style={{ display: "block", fontSize: 12.5, color: openSrc === i ? TEXT : TEXT_2, fontWeight: openSrc === i ? 600 : 400, lineHeight: 1.4 }}>
                          {result.names[i]}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: TEXT_3, marginTop: 2 }}>
                          {((w / result.total) * 100).toFixed(1)}% of the essay
                        </span>
                      </span>
                    </button>
                  ) : null)}
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingTop: 10, borderTop: `1px solid ${RULE}` }}>
                    <span style={{ width: 3, alignSelf: "stretch", background: RULE_2, flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <span style={{ display: "block", fontSize: 12.5, color: TEXT_2 }}>Written by the student</span>
                      <span style={{ display: "block", fontSize: 12, color: TEXT_3, marginTop: 2 }}>{(100 - pct).toFixed(1)}% of the essay</span>
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${RULE}`, fontSize: 12, color: TEXT_3, lineHeight: 1.65 }}>
                  <span style={{ background: INKS[0].fill, borderBottom: `2px solid ${INKS[0].line}`, padding: "1px 6px", color: TEXT }}>Shaded</span> means copied word for word.<br />
                  <span style={{ background: PARA_FILL, borderBottom: `1.5px dotted ${PARA_LINE}`, padding: "1px 6px", color: TEXT }}>Dotted</span> means the same idea, closely reworded.
                  {result.paraCount > 0 && ` ${result.paraCount} ${result.paraCount === 1 ? "sentence" : "sentences"}.`}
                </div>
              </div>
            </aside>

            {/* ── the two leaves ── */}
            <div className="pages tall" ref={pagesRef}>
              {thread && (
                <svg className="noprint" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4, overflow: "visible" }} aria-hidden="true">
                  <path
                    d={`M ${thread.x1} ${thread.y1} C ${thread.x1 + (thread.x2 - thread.x1) * 0.5} ${thread.y1}, ${thread.x1 + (thread.x2 - thread.x1) * 0.5} ${thread.y2}, ${thread.x2} ${thread.y2}`}
                    fill="none" stroke={INKS[(result.matches.find((m) => m.n === activeId) || result.matches[0] || { src: 0 }).src % INKS.length].line}
                    strokeWidth="1.75" strokeLinecap="round" opacity={thread.offA || thread.offB ? 0.4 : 0.9} />
                  {[[thread.x1, thread.y1, thread.offA], [thread.x2, thread.y2, thread.offB]].map(([x, y, off], i) => (
                    <circle key={i} cx={x} cy={y} r={off ? 2.4 : 3.6}
                      fill={INKS[(result.matches.find((m) => m.n === activeId) || result.matches[0] || { src: 0 }).src % INKS.length].line}
                      opacity={off ? 0.45 : 1} />
                  ))}
                </svg>
              )}

              <section style={{ ...leaf, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 3 }}>
                <div style={{ padding: "14px 22px", borderBottom: `1px solid ${RULE}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 17, fontWeight: 500 }}>The essay</span>
                  <span style={{ fontSize: 12.5, color: TEXT_3 }}>{result.total} words</span>
                </div>
                <div className="leaf" ref={leafL} style={{ flex: 1 }}>
                  <MarkedText pane="essay" text={result.essay}
                    regions={result.matches.map((m) => ({ n: m.n, from: m.start, to: m.end, src: m.src, words: m.words }))}
                    sentences={result.sentences} activeId={activeId} onPick={pick} />
                </div>
              </section>

              <section style={{ ...leaf, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 3 }}>
                <div style={{ borderBottom: `1px solid ${RULE}`, display: "flex", overflowX: "auto" }}>
                  {result.names.map((nm, i) => {
                    const c = INKS[i % INKS.length];
                    const cnt = result.matches.filter((m) => m.src === i).length;
                    const on = openSrc === i;
                    return (
                      <button key={i} className="tab" onClick={() => setOpenSrc(i)}
                        style={{ borderBottomColor: on ? c.line : "transparent", color: on ? TEXT : TEXT_3, fontWeight: on ? 600 : 400 }}>
                        <span style={{ width: 9, height: 9, background: c.line, flexShrink: 0, opacity: on ? 1 : 0.55 }} />
                        {nm}
                        <span style={{ fontSize: 12, color: TEXT_3 }}>{cnt}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="leaf" ref={leafR} style={{ flex: 1 }}>
                  <MarkedText pane="src" text={result.srcTexts[openSrc] || ""}
                    regions={result.matches.filter((m) => m.src === openSrc)
                      .map((m) => ({ n: m.n, from: m.srcStart, to: m.srcEnd, src: m.src, words: m.words }))}
                    activeId={activeId} onPick={pick} />
                </div>
              </section>
            </div>
          </div>
        </main>
      )}

      <footer style={{ borderTop: `1px solid ${RULE_2}`, marginTop: 10 }}>
        <div className="shell" style={{ padding: "20px 30px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: TEXT_3 }}>
          <span>The University of Sydney</span>
          <span>Runs entirely in your browser. No text is uploaded or stored.</span>
        </div>
      </footer>

      {note && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: INK, color: "#fff", padding: "12px 22px", fontSize: 13.5, zIndex: 60, borderRadius: 3, boxShadow: "0 10px 32px rgba(34,41,31,.35)" }}>
          {note}
        </div>
      )}
    </div>
  );
}
