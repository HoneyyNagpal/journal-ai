# ArvyaX Journal System

AI-assisted journaling platform for nature immersion sessions. Users write reflections after forest, ocean, or mountain sessions, and the system analyzes emotions using an LLM.

---

## Tech Stack

| Layer    | Technology              |
|----------|------------------------|
| Backend  | Node.js + Express       |
| Database | MongoDB (via Mongoose)  |
| LLM      | Groq (llama-3.3-70b-versatile) |
| Frontend | React + Vite            |

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB running locally (`mongod`) or a MongoDB Atlas URI
- An Anthropic API key (`ANTHROPIC_API_KEY`)

---

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in MONGO_URI and ANTHROPIC_API_KEY in .env
npm install
npm run dev
```

Server starts on `http://localhost:5001`.

---

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App opens on `http://localhost:5173`. The Vite dev server proxies `/api` calls to port 5001.

---

## API Reference

### POST `/api/journal`
Create a new journal entry.

**Request body:**
```json
{
  "userId": "user_001",
  "ambience": "forest",
  "text": "I felt calm today after listening to the rain."
}
```

**Response:** The created entry document (201).

---

### GET `/api/journal/:userId`
Get all entries for a user, newest first.

---

### POST `/api/journal/analyze`
Analyze emotion from journal text using an LLM.

**Request body:**
```json
{
  "text": "I felt calm today after listening to the rain.",
  "entryId": "<optional: saves result to the entry>"
}
```

**Response:**
```json
{
  "emotion": "calm",
  "keywords": ["rain", "nature", "peace"],
  "summary": "User experienced relaxation during the forest session"
}
```

---

### GET `/api/journal/insights/:userId`
Aggregated insights across all entries for a user.

**Response:**
```json
{
  "totalEntries": 8,
  "topEmotion": "calm",
  "mostUsedAmbience": "forest",
  "recentKeywords": ["focus", "nature", "rain"]
}
```

---

## Environment Variables

| Variable           | Description                              | Default                          |
|--------------------|------------------------------------------|----------------------------------|
| `PORT`             | Backend port                             | `5001`                           |
| `MONGO_URI`        | MongoDB connection string                | `mongodb://127.0.0.1:27017/arvyax` |
| `GROQ_API_KEY`     | Groq API key (free at console.groq.com)  | —                                |
| `FRONTEND_URL`     | CORS origin for the frontend             | `http://localhost:5173`          |

---

## Project Structure

```
arvyax-journal/
├── backend/
│   ├── server.js              # Express app, DB connect, middleware
│   ├── routes/
│   │   └── journal.js         # All /api/journal routes
│   ├── models/
│   │   └── Journal.js         # Mongoose schema
│   ├── services/
│   │   └── llmService.js      # Anthropic API + in-memory cache
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Single-page UI (Write + Entries + Insights)
│   │   ├── index.css          # Global styles
│   │   └── main.jsx           # React entry point
│   ├── index.html
│   └── vite.config.js
├── README.md
└── ARCHITECTURE.md
```

---

## Design Decisions

- **Groq + llama-3.3-70b-versatile** is used for analysis - completely free tier, fast inference, and reliable enough for structured JSON output.
- **In-memory cache** (`node-cache`) deduplicates identical text analyses within a 1-hour TTL, cutting LLM costs for repeated submissions.
- **Rate limiting** is applied globally (100 req/15min) and specifically to `/analyze` (20 req/hour) to protect against abuse.
- The `/analyze` endpoint accepts an optional `entryId` — when provided, the result is persisted directly to the journal entry in MongoDB, eliminating a separate PATCH call.
