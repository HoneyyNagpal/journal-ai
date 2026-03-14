const express = require("express");
const router = express.Router();
const { randomUUID } = require("crypto");
const { getDb, persist } = require("../db/database");
const { analyzeEmotion } = require("../services/llmService");

function parseEntry(row) {
  if (!row) return null;
  return {
    ...row,
    analyzed: row.analyzed === 1,
    analysis: {
      emotion: row.emotion || null,
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
      summary: row.summary || null,
    },
  };
}

function queryAll(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params = []) {
  const db = getDb();
  db.run(sql, params);
  persist();
}

// POST /api/journal
router.post("/", (req, res) => {
  const { userId, ambience, text } = req.body;
  if (!userId || !ambience || !text)
    return res.status(400).json({ error: "userId, ambience, and text are required." });
  if (text.length > 5000)
    return res.status(400).json({ error: "Journal entry must be under 5000 characters." });

  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    run(
      "INSERT INTO journals (id, userId, ambience, text, analyzed, createdAt, updatedAt) VALUES (?,?,?,?,0,?,?)",
      [id, userId, ambience, text, now, now]
    );
    return res.status(201).json(parseEntry(queryOne("SELECT * FROM journals WHERE id = ?", [id])));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create journal entry." });
  }
});

// GET /api/journal/insights/:userId — before /:userId
router.get("/insights/:userId", (req, res) => {
  try {
    const entries = queryAll("SELECT * FROM journals WHERE userId = ?", [req.params.userId]);
    if (!entries.length)
      return res.json({ totalEntries: 0, topEmotion: null, mostUsedAmbience: null, recentKeywords: [] });

    const emotionCount = {}, ambienceCount = {}, keywordMap = {};
    entries.forEach((e) => {
      ambienceCount[e.ambience] = (ambienceCount[e.ambience] || 0) + 1;
      if (e.analyzed && e.emotion) {
        const em = e.emotion.toLowerCase();
        emotionCount[em] = (emotionCount[em] || 0) + 1;
        if (e.keywords)
          JSON.parse(e.keywords).forEach((kw) => {
            const k = kw.toLowerCase();
            keywordMap[k] = (keywordMap[k] || 0) + 1;
          });
      }
    });

    return res.json({
      totalEntries: entries.length,
      topEmotion: Object.keys(emotionCount).sort((a, b) => emotionCount[b] - emotionCount[a])[0] || null,
      mostUsedAmbience: Object.keys(ambienceCount).sort((a, b) => ambienceCount[b] - ambienceCount[a])[0] || null,
      recentKeywords: Object.keys(keywordMap).sort((a, b) => keywordMap[b] - keywordMap[a]).slice(0, 5),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch insights." });
  }
});

// GET /api/journal/:userId
router.get("/:userId", (req, res) => {
  try {
    const rows = queryAll(
      "SELECT * FROM journals WHERE userId = ? ORDER BY createdAt DESC",
      [req.params.userId]
    );
    return res.json(rows.map(parseEntry));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch entries." });
  }
});

// POST /api/journal/analyze
router.post("/analyze", async (req, res) => {
  const { text, entryId } = req.body;
  if (!text || text.trim().length < 5)
    return res.status(400).json({ error: "text is required (min 5 characters)." });
  try {
    const result = await analyzeEmotion(text);
    if (entryId) {
      run(
        "UPDATE journals SET emotion=?, keywords=?, summary=?, analyzed=1, updatedAt=? WHERE id=?",
        [result.emotion, JSON.stringify(result.keywords), result.summary, new Date().toISOString(), entryId]
      );
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Analysis failed." });
  }
});

module.exports = router;

// POST /api/journal/analyze/stream — SSE streaming version
const { analyzeEmotionStream } = require("../services/llmService");

router.post("/analyze/stream", async (req, res) => {
  const { text, entryId } = req.body;
  if (!text || text.trim().length < 5)
    return res.status(400).json({ error: "text is required (min 5 characters)." });
  try {
    const result = await analyzeEmotionStream(text, res);
    if (entryId && result) {
      run(
        "UPDATE journals SET emotion=?, keywords=?, summary=?, analyzed=1, updatedAt=? WHERE id=?",
        [result.emotion, JSON.stringify(result.keywords), result.summary, new Date().toISOString(), entryId]
      );
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});