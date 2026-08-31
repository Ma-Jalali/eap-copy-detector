import { useState, useEffect, useMemo } from "react";

/* ================= USYD PALETTE ================= */
const RED = "#e64626";
const RED_DK = "#B5341A";
const SAND = "#FCEDE2";
const SAND_DK = "#F2DECE";
const CHAR = "#424242";
const GREY = "#F1F1F1";
const INK = "#000000";
const LINE = "#E5D7CB";
const AMBER = "#C87D2E";
const AMBER_BG = "#FBF0DC";
const GREEN = "#3F6B3A";

const SRC = [
  { line: "#e64626", fill: "#FBDCD4" },
  { line: "#A8321A", fill: "#F4D6CE" },
  { line: "#C87D2E", fill: "#F9E7D2" },
  { line: "#7A4A2A", fill: "#EFE0D3" },
  { line: "#424242", fill: "#E4E4E4" },
  { line: "#8C6239", fill: "#F1E4D6" },
  { line: "#6E2B18", fill: "#ECD8D0" },
  { line: "#B5885C", fill: "#F6EADD" },
];

const STOP = new Set(("a an the and or but if of to in on at for with by from as is are was were be been being this that these those it its they them their there here which who whom whose what when where how why not no nor so than then too very can will just should now also into about over under more most other some such only own same s t don").split(" "));

/* ================= TEXT UTILITIES ================= */
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
  const ranges = []; const re = /[""][^""]{6,}[""]|"[^"]{6,}"/g; let m;
  while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

const contentSet = (text) =>
  new Set(tokenize(text).map((t) => norm(t.w)).filter((w) => w.length > 2 && !STOP.has(w)));

/* ================= ENGINE ================= */
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

  /* ---- sentence-level paraphrase detection ---- */
  const srcSentSets = [];
  sources.forEach((s, si) => splitSentences(s).forEach((r) => {
    const set = contentSet(s.slice(r.s, r.e));
    if (set.size >= 3) srcSentSets.push({ set, si });
  }));

  const sentences = splitSentences(essay).map((r) => {
    const words = tk.filter((t) => t.s >= r.s && t.e <= r.e).length;
    const vb = spans.filter((sp) => sp.end > r.s && sp.start < r.e)
      .reduce((a, sp) => a + sp.words, 0);
    const set = contentSet(essay.slice(r.s, r.e));
    let best = 0, bestSrc = -1;
    if (set.size >= 3) {
      srcSentSets.forEach(({ set: ss, si }) => {
        let hit = 0; set.forEach((w) => { if (ss.has(w)) hit++; });
        const ratio = hit / set.size;
        if (ratio > best) { best = ratio; bestSrc = si; }
      });
    }
    const ratio = words ? vb / words : 0;
    const kind = ratio >= 0.34 ? "verbatim" : best >= 0.62 ? "para" : "own";
    return { ...r, words, kind, overlap: Math.round(best * 100), src: bestSrc };
  });

  const paraCount = sentences.filter((s) => s.kind === "para").length;
  const vbCount = sentences.filter((s) => s.kind === "verbatim").length;

  return { spans, total: n, copied, perSource, longest, sentences, paraCount, vbCount, tk };
}

/* ================= ICONS ================= */
const I = {
  doc: (c) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>),
  layers: (c) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>),
  scan: (c) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="7" y1="12" x2="17" y2="12" /></svg>),
  trash: (c) => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>),
  plus: (c) => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>),
  print: (c) => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>),
  down: (c) => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>),
  copy: (c) => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>),
  x: (c) => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>),
};

const card = { borderRadius: 8, border: `1px solid ${LINE}`, background: "#fff" };
const lbl = { fontSize: 10.5, letterSpacing: 1.8, fontWeight: 800, textTransform: "uppercase", color: CHAR, lineHeight: 1.2 };

function Minimap({ result }) {
  const h = 80;
  const chars = Math.min(result.essay.length, 2000);
  const scale = result.essay.length / chars;
  const rects = result.spans.map((sp) => ({
    x: sp.start / scale,
    w: (sp.end - sp.start) / scale,
    src: sp.src,
  }));
  return (
    <svg width="100%" height={h} style={{ background: GREY }}>
      <rect width="100%" height={h} fill={SAND_DK} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y="0" width={Math.max(r.w, 1)} height={h} fill={SRC[r.src % 8].line} />
      ))}
    </svg>
  );
}

export default function App() {
  const [essay, setEssay] = useState("");
  const [sources, setSources] = useState(["", "", "", "", ""]);
  const [result, setResult] = useState(null);
  const [minW, setMinW] = useState(4);
  const [ignoreQuotes, setIgnoreQuotes] = useState(true);
  const [view, setView] = useState("all");
  const [toast, setToast] = useState(null);

  const handleSourceChange = (i, v) => {
    const n = [...sources];
    n[i] = v;
    setSources(n);
  };

  const run = () => {
    if (!essay.trim()) {
      setToast("Please enter an essay");
      return;
    }
    if (!sources.some((s) => s.trim())) {
      setToast("Add at least one source text");
      return;
    }
    const validSources = sources.filter((s) => s.trim());
    const res = analyse(essay, validSources, minW, ignoreQuotes);
    res.essay = essay;
    setResult(res);
  };

  const reset = () => {
    setResult(null);
    setEssay("");
    setSources(["", "", "", "", ""]);
  };

  const renderAnnotated = () => {
    if (!result) return null;
    const fragments = [];
    let lastEnd = 0;
    [...result.spans].sort((a, b) => a.start - b.start).forEach((sp) => {
      if (lastEnd < sp.start) {
        const plainText = essay.slice(lastEnd, sp.start);
        fragments.push({ type: "own", text: plainText });
      }
      const matchedText = essay.slice(sp.start, sp.end);
      fragments.push({ type: "match", text: matchedText, src: sp.src });
      lastEnd = sp.end;
    });
    if (lastEnd < essay.length) {
      fragments.push({ type: "own", text: essay.slice(lastEnd) });
    }

    const sentenceFrags = result.sentences.map((sent) => {
      const sentText = essay.slice(sent.s, sent.e);
      return { type: "sent", text: sentText, kind: sent.kind, sent };
    });

    const toShow = view === "all" ? fragments : view === "clean" ? sentenceFrags.filter((f) => f.kind === "own").map((f) => ({ type: "own", text: f.text })) : view === "verbatim" ? sentenceFrags.filter((f) => f.kind === "verbatim").map((f) => ({ type: "match", text: f.text, src: f.sent.src })) : sentenceFrags.filter((f) => f.kind === "para").map((f) => ({ type: "para", text: f.text, src: f.sent.src }));

    return toShow.map((f, i) => {
      if (f.type === "own") return <span key={i}>{f.text}</span>;
      if (f.type === "match") {
        const c = SRC[f.src % 8];
        return (
          <span key={i} style={{ background: c.fill, borderBottom: `2px solid ${c.line}` }}>
            {f.text}
          </span>
        );
      }
      if (f.type === "para") {
        return (
          <span key={i} style={{ background: AMBER_BG, borderBottom: `2px dotted ${AMBER}` }}>
            {f.text}
          </span>
        );
      }
    });
  };

  const download = () => {
    const lines = [
      "ESSAY COPY DETECTION REPORT",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "SUMMARY",
      `Total words: ${result.total}`,
      `Copied words: ${result.copied}`,
      `Copy %: ${((result.copied / result.total) * 100).toFixed(1)}%`,
      `Verbatim sentences: ${result.vbCount}`,
      `Paraphrased sentences: ${result.paraCount}`,
      "",
      "MATCHED PASSAGES",
      ...result.spans
        .sort((a, b) => b.words - a.words)
        .map((sp) => `[S${sp.src + 1}] ${sp.words}w: "${result.essay.slice(sp.start, sp.end)}"`),
    ];
    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "copy-report.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySummary = () => {
    const text = `Copy Detection Summary\n${result.copied}/${result.total} words (${((result.copied / result.total) * 100).toFixed(1)}%)\n${result.spans.length} matched passages\n${result.vbCount} verbatim sentences, ${result.paraCount} paraphrased`;
    navigator.clipboard.writeText(text).then(() => setToast("Summary copied!"));
  };

  const pctOwn = ((result.total - result.copied) / result.total) * 100;

  return (
    <div style={{ background: SAND, minHeight: "100vh" }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .btn { cursor: pointer; border: none; border-radius: 6px; font-weight: 600; transition: all .2s; }
        .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,.15); }
        .row:hover { background: #FCFAF8; }
        .scroll::-webkit-scrollbar { width: 6px; }
        .scroll::-webkit-scrollbar-track { background: ${GREY}; }
        .scroll::-webkit-scrollbar-thumb { background: ${LINE}; border-radius: 3px; }
        .scroll::-webkit-scrollbar-thumb:hover { background: ${CHAR}; }
        .vw { background: transparent; border: 1px solid ${LINE}; color: ${CHAR}; padding: "6px 11px"; font-size: 10.5; cursor: pointer; border-radius: 4px; font-weight: 700; transition: all .15s; }
        .vw:hover { background: ${LINE}; }
        .vw.on { background: ${INK}; color: #fff; border-color: ${INK}; }
        .fade { animation: fadeIn .4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .toast { animation: slideIn .3s cubic-bezier(.34,1,.68,1); }
        @keyframes slideIn { from { transform: translateX(-50%) translateY(20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @media print { .noprint { display: none; } body { background: #fff; } }
      `}</style>

      {/* ============ HEADER ============ */}
      <div style={{ background: INK, color: "#fff", padding: "28px 26px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.8, fontWeight: 800, textTransform: "uppercase", opacity: 0.7 }}>The University of Sydney</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>Essay Copy Detector</div>
          <div style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.6, opacity: 0.85 }}>Check how many words in your essay have been copied word-for-word from source texts without paraphrasing.</div>
        </div>
      </div>

      {/* ============ MAIN CONTENT ============ */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "30px 26px", minHeight: "calc(100vh - 260px)" }}>
        {!result ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
            {/* ESSAY */}
            <div style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "13px 20px", background: INK, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                {I.doc("#fff")}<span style={{ fontSize: 10, letterSpacing: 1.7, fontWeight: 800 }}>YOUR ESSAY</span>
              </div>
              <textarea
                value={essay}
                onChange={(e) => setEssay(e.target.value)}
                placeholder="Paste your essay here..."
                style={{
                  width: "100%",
                  height: 350,
                  padding: "16px 18px",
                  border: "none",
                  resize: "none",
                  fontFamily: "Georgia,serif",
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: INK,
                }}
              />
            </div>

            {/* SOURCES */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sources.map((src, i) => (
                <div key={i} style={{ ...card, overflow: "hidden", flex: 1 }}>
                  <div style={{ padding: "10px 14px", background: SRC[i % 8].line, color: "#fff", display: "flex", alignItems: "center", gap: 7 }}>
                    {I.layers("#fff")}<span style={{ fontSize: 9.5, letterSpacing: 1.5, fontWeight: 800 }}>SOURCE {i + 1}</span>
                  </div>
                  <textarea
                    value={src}
                    onChange={(e) => handleSourceChange(i, e.target.value)}
                    placeholder={`Source text ${i + 1}...`}
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: "14px 16px",
                      border: "none",
                      resize: "none",
                      fontFamily: "Georgia,serif",
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: INK,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* CONTROLS & SETTINGS */}
        {!result && (
          <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ ...card, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 11.5, fontWeight: 600 }}>Minimum run length:</label>
              <input
                type="number"
                min="3"
                max="10"
                value={minW}
                onChange={(e) => setMinW(Math.max(3, parseInt(e.target.value) || 3))}
                style={{ width: 50, padding: "6px 8px", border: `1px solid ${LINE}`, borderRadius: 4 }}
              />
            </div>
            <label style={{ ...card, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={ignoreQuotes} onChange={(e) => setIgnoreQuotes(e.target.checked)} />
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>Ignore quoted text</span>
            </label>
            <button className="btn" onClick={run} style={{ background: RED, color: "#fff", padding: "12px 20px", fontSize: 11.5, fontWeight: 700, flex: 1, boxShadow: "0 4px 14px rgba(230,70,38,.3)" }}>
              {I.scan("#fff")} ANALYZE
            </button>
          </div>
        )}

        {/* RESULTS */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <button className="btn" onClick={reset} style={{ alignSelf: "flex-start", background: "#fff", color: CHAR, border: `1px solid ${LINE}`, padding: "10px 14px", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              {I.x(CHAR)} START OVER
            </button>

            {/* stat box */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr", gap: 16 }}>
              <div style={{ ...card, padding: "20px 24px" }}>
                <div style={{ fontSize: 10, letterSpacing: 1.8, fontWeight: 800, textTransform: "uppercase", color: CHAR, marginBottom: 14 }}>Copy detection</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, color: RED }}>
                    {((result.copied / result.total) * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11.5, color: CHAR, lineHeight: 1.5, paddingBottom: 8 }}>
                    copied
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: CHAR, lineHeight: 1.5, paddingTop: 4 }}>
                  {result.copied} of {result.total} words across{" "}
                  <strong>{result.spans.length}</strong> passage{result.spans.length === 1 ? "" : "s"}
                </div>
              </div>

              {/* stat strip */}
              <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                {[
                  { l: "Verbatim sentences", v: result.vbCount, c: RED },
                  { l: "Close paraphrase", v: result.paraCount, c: AMBER },
                  { l: "Own sentences", v: result.sentences.length - result.vbCount - result.paraCount, c: GREEN },
                ].map((s) => (
                  <div key={s.l} style={{ ...card, borderTop: `3px solid ${s.c}`, padding: "13px 14px" }}>
                    <div style={{ fontFamily: "Georgia,serif", fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 9.5, letterSpacing: .9, textTransform: "uppercase", color: CHAR, marginTop: 5, fontWeight: 800, lineHeight: 1.3 }}>{s.l}</div>
                  </div>))}
              </div>
            </div>

            {/* minimap */}
            <div style={{ ...card, padding: "16px 20px" }}>
              <div style={{ ...lbl, marginBottom: 12 }}>Copying density across the essay</div>
              <Minimap result={result} />
            </div>

            {/* composition */}
            {result.copied > 0 && (
              <div style={{ ...card, padding: "16px 20px" }}>
                <div style={{ ...lbl, marginBottom: 12 }}>Where the copying came from</div>
                <div style={{ display: "flex", height: 24, overflow: "hidden", border: `1px solid ${LINE}` }}>
                  {result.perSource.map((w, i) => w > 0 ? (
                    <div key={i} title={`Source ${i + 1}: ${w} words`}
                      style={{ width: `${(w / result.total) * 100}%`, background: SRC[i % 8].line, transition: "width .9s cubic-bezier(.34,1,.4,1)" }} />) : null)}
                  <div style={{ width: `${pctOwn}%`, background: SAND_DK, transition: "width .9s" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 12 }}>
                  {result.perSource.map((w, i) => w > 0 ? (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                      <span style={{ width: 11, height: 11, background: SRC[i % 8].line }} />
                      <strong>S{i + 1}</strong><span style={{ color: CHAR }}>{w}w · {Math.round((w / result.total) * 100)}%</span>
                    </div>) : null)}
                </div>
              </div>
            )}

            {/* longest */}
            {result.longest && (
              <div style={{ background: SAND, borderLeft: `4px solid ${RED}`, padding: "15px 20px" }}>
                <div style={{ ...lbl, color: RED, marginBottom: 7 }}>Longest unbroken match · {result.longest.words} words</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.65, fontStyle: "italic" }}>
                  "{result.essay.slice(result.longest.start, result.longest.end)}"
                </div>
                <div style={{ fontSize: 11, color: CHAR, marginTop: 7 }}>From Source {result.longest.src + 1}</div>
              </div>
            )}

            {/* matched passages */}
            {result.spans.length > 0 && (
              <div style={{ ...card, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", background: "#FCFAF8", borderBottom: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between" }}>
                  <span style={lbl}>Matched passages</span>
                  <span style={{ fontSize: 10.5, color: "#9A8D84" }}>longest first</span>
                </div>
                <div className="scroll" style={{ maxHeight: 260, overflowY: "auto" }}>
                  {[...result.spans].sort((a, b) => b.words - a.words).map((sp, i) => {
                    const c = SRC[sp.src % 8];
                    return (
                      <div key={i} className="row" style={{ display: "flex", gap: 11, padding: "11px 20px", borderBottom: `1px solid ${GREY}` }}>
                        <div style={{ background: c.line, color: "#fff", fontSize: 9.5, fontWeight: 800, padding: "2px 6px", height: 17, flexShrink: 0, borderRadius: 3 }}>S{sp.src + 1}</div>
                        <div style={{ fontFamily: "Georgia,serif", fontSize: 14, fontWeight: 700, minWidth: 26, flexShrink: 0 }}>{sp.words}</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: CHAR }}>"{result.essay.slice(sp.start, sp.end)}"</div>
                      </div>);
                  })}
                </div>
              </div>
            )}

            {/* export */}
            <div className="noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={download} style={{ background: RED, color: "#fff", padding: "12px 16px", fontSize: 11, flex: 1, boxShadow: "0 4px 14px rgba(230,70,38,.3)" }}>{I.down("#fff")} REPORT</button>
              <button className="btn" onClick={copySummary} style={{ background: "#fff", color: CHAR, border: `1px solid ${LINE}`, padding: "12px 16px", fontSize: 11, flex: 1 }}>{I.copy(CHAR)} COPY STATS</button>
              <button className="btn" onClick={() => window.print()} style={{ background: "#fff", color: CHAR, border: `1px solid ${LINE}`, padding: "12px 16px", fontSize: 11, flex: 1 }}>{I.print(CHAR)} PRINT</button>
            </div>
          </div>
        )}

        {/* FULL-WIDTH ANNOTATED ESSAY */}
        {result && (
          <div className="fade" style={{ ...card, width: "100%", marginTop: 20 }}>
            <div style={{ padding: "13px 22px", background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                {I.doc("#fff")}<span style={{ fontSize: 10, letterSpacing: 1.7, fontWeight: 800 }}>ANNOTATED ESSAY</span>
              </div>
              <div className="noprint" style={{ display: "flex", gap: 5 }}>
                {[["all", "ALL"], ["verbatim", "VERBATIM ONLY"], ["para", "PARAPHRASE ONLY"], ["clean", "CLEAN READ"]].map(([k, l]) => (
                  <button key={k} className={`vw ${view === k ? "on" : ""}`} onClick={() => setView(k)}>{l}</button>))}
              </div>
            </div>

            <div style={{ padding: "14px 26px", background: "#FCFAF8", borderBottom: `1px solid ${LINE}`, display: "flex", gap: 22, flexWrap: "wrap", fontSize: 11.5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ background: SRC[0].fill, borderBottom: `2px solid ${SRC[0].line}`, padding: "1px 8px", fontWeight: 700 }}>abc</span>
                Copied word-for-word
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ background: AMBER_BG, borderBottom: `2px dotted ${AMBER}`, padding: "1px 8px" }}>abc</span>
                Closely paraphrased sentence
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ padding: "1px 8px" }}>abc</span>Student's own
              </span>
            </div>

            <div style={{ padding: "28px 30px", fontSize: 15.5, lineHeight: 2.05, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 860 }}>
              {renderAnnotated()}
            </div>
          </div>
        )}
      </div>

      {/* ============ FOOTER ============ */}
      <div style={{ background: INK, color: "rgba(255,255,255,.5)", padding: "24px 26px", marginTop: 30 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", fontSize: 11.5 }}>
          <span>© The University of Sydney · Essay Copy Detector</span>
          <span>Runs entirely in your browser — no text is uploaded or stored</span>
        </div>
      </div>

      {toast && (
        <div className="toast" style={{ position: "fixed", bottom: 26, left: "50%", background: INK, color: "#fff", padding: "12px 22px", fontSize: 12.5, fontWeight: 600, zIndex: 60, boxShadow: "0 8px 30px rgba(0,0,0,.3)", borderRadius: 4, transform: "translateX(-50%)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
