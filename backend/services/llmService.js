// services/llmService.js
// Groq API — free tier, llama-3.3-70b-versatile
// Supports both regular and streaming analysis

const NodeCache = require("node-cache");

const analysisCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

function cacheKey(text) {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) & 0xffffffff;
  }
  return `analysis_${hash}`;
}

function buildPrompt(text) {
  return `You are an emotion analyst for a nature-based wellness app. Analyze the journal entry below and respond ONLY with valid JSON — no explanation, no markdown, no code fences.

Journal entry:
"""
${text}
"""

Return exactly this JSON shape:
{
  "emotion": "<single dominant emotion, e.g. calm, anxious, joyful, melancholic, energized, grateful, restless>",
  "keywords": ["<3-5 relevant words>"],
  "summary": "<one sentence summarizing the user's mental state>"
}`;
}

// Standard (non-streaming) analysis
async function analyzeEmotion(text) {
  const key = cacheKey(text);
  const cached = analysisCache.get(key);
  if (cached) {
    console.log("Cache hit for analysis");
    return { ...cached, cached: true };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set in environment variables.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      temperature: 0.3,
      messages: [{ role: "user", content: buildPrompt(text) }],
    }),
  });

  if (!response.ok) throw new Error(`Groq API error ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const result = JSON.parse(raw.replace(/```json|```/g, "").trim());

  if (!result.emotion || !Array.isArray(result.keywords) || !result.summary)
    throw new Error(`Unexpected LLM response shape: ${raw}`);

  analysisCache.set(key, result);
  return result;
}

// Streaming analysis — pipes SSE tokens to the response, resolves with final parsed result
async function analyzeEmotionStream(text, res) {
  const key = cacheKey(text);
  const cached = analysisCache.get(key);

  // Even on cache hit, stream it character by character so UI behaviour is consistent
  if (cached) {
    console.log("Cache hit (streaming)");
    const json = JSON.stringify(cached);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    for (const char of json) {
      res.write(`data: ${JSON.stringify({ token: char })}\n\n`);
      await new Promise((r) => setTimeout(r, 5));
    }
    res.write(`data: ${JSON.stringify({ done: true, result: cached })}\n\n`);
    res.end();
    return cached;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set in environment variables.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      temperature: 0.3,
      stream: true,
      messages: [{ role: "user", content: buildPrompt(text) }],
    }),
  });

  if (!response.ok) throw new Error(`Groq API error ${response.status}: ${await response.text()}`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullText = "";
  const decoder = new TextDecoder();

  for await (const chunk of response.body) {
    const lines = decoder.decode(chunk).split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content || "";
        if (token) {
          fullText += token;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  // Parse and cache the completed JSON
  const result = JSON.parse(fullText.replace(/```json|```/g, "").trim());
  analysisCache.set(key, result);

  res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
  res.end();
  return result;
}

module.exports = { analyzeEmotion, analyzeEmotionStream };