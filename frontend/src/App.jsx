import { useState, useEffect, useCallback } from "react";

const API = "/api/journal";

const AMBIENCES = [
  { id: "forest", label: "Forest", em: "🌲" },
  { id: "ocean", label: "Ocean", em: "🌊" },
  { id: "mountain", label: "Mountain", em: "⛰️" },
  { id: "desert", label: "Desert", em: "🏜️" },
  { id: "meadow", label: "Meadow", em: "🌾" },
];

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ─── Write Entry Panel ─────────────────────────────────────────────────────
function WritePanel({ userId, onEntryCreated }) {
  const [ambience, setAmbience] = useState("forest");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleSubmit() {
    if (!text.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ambience, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus({ type: "success", msg: "Entry saved." });
      setText("");
      onEntryCreated(data);
    } catch (e) {
      setStatus({ type: "error", msg: e.message || "Failed to save." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">
       
        Write Today's Entry
      </div>

      <div className="field">
        <label>Ambience</label>
        <div className="ambience-grid">
          {AMBIENCES.map((a) => (
            <button
              key={a.id}
              className={`ambience-btn${ambience === a.id ? " active" : ""}`}
              onClick={() => setAmbience(a.id)}
            >
              <span className="em">{a.em}</span>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Your reflection</label>
        <textarea
          rows={6}
          placeholder="What did you feel during your session today? Describe the sensations, thoughts, or emotions that surfaced..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
        />
        <div style={{ textAlign: "right", fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>
          {text.length}/5000
        </div>
      </div>

      <div className="btn-row">
        <button
          className="btn btn-ghost"
          onClick={() => setText("")}
          disabled={!text || loading}
        >
          Clear
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!text.trim() || loading}
        >
          {loading ? <span className="spinner" /> : "Save Entry"}
        </button>
      </div>

      {status && (
        <div className={`status-msg ${status.type}`}>{status.msg}</div>
      )}
    </div>
  );
}

// ─── Entry Card ────────────────────────────────────────────────────────────
function EntryItem({ entry, onAnalyzed }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState(null);

  async function handleAnalyze() {
  setAnalyzing(true);
  setErr(null);
  try {
    const res = await fetch(`${API}/analyze/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: entry.text, entryId: entry.id }),
    });

    if (!res.ok) throw new Error("Analysis failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        console.log("line received:", line);
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.done && parsed.result) {
            onAnalyzed(entry.id, parsed.result);
          }
        } catch { /* skip */ }
      }
    }
  } catch (e) {
    setErr(e.message || "Analysis failed");
  } finally {
    setAnalyzing(false);
  }
}

  const amb = AMBIENCES.find((a) => a.id === entry.ambience);

  return (
    <div className="entry-card">
      <div className="entry-header">
        <div className="entry-meta">
         <span className="ambience-tag">{entry.ambience}</span>
          <span className="entry-date">{formatDate(entry.createdAt)}</span>
        </div>
        {(!entry.analyzed && !entry.analysis?.emotion) && (
          <button
            className="btn btn-analyze"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Analyze"}
          </button>
        )}
      </div>

      <p className="entry-text">{entry.text}</p>

      {err && <div className="status-msg error">{err}</div>}

      {(entry.analyzed || entry.analysis?.emotion) && entry.analysis?.emotion && (
        <div className="analysis-result">
          <div className="analysis-emotion">"{entry.analysis.emotion}"</div>
          <div className="analysis-summary">{entry.analysis.summary}</div>
          <div className="keywords">
            {entry.analysis.keywords.map((kw) => (
              <span key={kw} className="kw">{kw}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entries Panel ─────────────────────────────────────────────────────────
function EntriesPanel({ entries, setEntries }) {
  function handleAnalyzed(id, result) {
    console.log("handleAnalyzed called:", id, result);
    setEntries((prev) =>
      prev.map((e) =>
       e.id === id
          ? { ...e, analyzed: true, analysis: result }
          : e
      )
    );
  }

  return (
    <div className="card">
      <div className="card-title">
        
        Past Entries
        <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--sans)" }}>
          {entries.length} total
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <span className="em">🌱</span>
          No entries yet. Write your first reflection above.
        </div>
      ) : (
        <div className="entries-list">
          {entries.map((e) => (
            <EntryItem key={e._id} entry={e} onAnalyzed={handleAnalyzed} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Insights Panel ────────────────────────────────────────────────────────
function InsightsPanel({ userId, refresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/insights/${userId}`);
      const d = await res.json();
      setData(d);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load, refresh]);

  const amb = AMBIENCES.find((a) => a.id === data?.mostUsedAmbience);

  return (
    <div className="card card-full">
      <div className="card-title">
       
        Insights
        <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "4px 12px", fontSize: "0.75rem" }} onClick={load}>
          {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Refresh"}
        </button>
      </div>

      {!data || data.totalEntries === 0 ? (
        <div className="empty">
          <span className="em">🌿</span>
          Analyze a few entries to see patterns emerge.
        </div>
      ) : (
        <>
          <div className="insights-grid">
            <div className="insight-tile">
              <div className="val">{data.totalEntries}</div>
              <div className="lbl">Total entries</div>
            </div>
            <div className="insight-tile">
              <div className="val" style={{ color: "var(--gold)" }}>
                {data.topEmotion || "—"}
              </div>
              <div className="lbl">Top emotion</div>
            </div>
            <div className="insight-tile">
              <div className="val">
                {amb ? `${amb.em}` : "—"}
              </div>
              <div className="lbl">{data.mostUsedAmbience || "No ambience yet"}</div>
            </div>
            <div className="insight-tile">
              <div className="val" style={{ fontSize: "1.4rem" }}>
                {data.recentKeywords?.length || 0}
              </div>
              <div className="lbl">Unique keywords</div>
            </div>
          </div>

          {data.recentKeywords?.length > 0 && (
            <div className="keywords-section">
              <label>Recurring themes</label>
              <div className="keywords">
                {data.recentKeywords.map((kw) => (
                  <span key={kw} className="kw">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [userId] = useState("user_001"); // In a real app, from auth
  const [entries, setEntries] = useState([]);
  const [insightRefresh, setInsightRefresh] = useState(0);

  // Load entries on mount
  useEffect(() => {
    fetch(`${API}/${userId}`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {});
  }, [userId]);

  function handleEntryCreated(entry) {
    console.log("new entry:", entry);
    setEntries((prev) => [entry, ...prev]);
    setInsightRefresh((n) => n + 1);
  }

  return (
    <div className="layout">
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">
            Arvya<span>X</span> Journal
          </div>
          <div className="header-sub">Nature-based reflection system</div>
        </div>
        <div className="user-badge">
          <span className="dot" />
          {userId}
        </div>
      </header>

      <div className="grid">
        <WritePanel userId={userId} onEntryCreated={handleEntryCreated} />
        <EntriesPanel entries={entries} setEntries={setEntries} />
        <InsightsPanel userId={userId} refresh={insightRefresh} />
      </div>
    </div>
  );
}
