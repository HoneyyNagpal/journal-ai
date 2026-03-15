// db/database.js
// sql.js — pure JS SQLite, no native compilation needed.
// DB is persisted to journal.db on disk and loaded back on restart.

const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "journal.db");

let db;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS journals (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      ambience  TEXT NOT NULL,
      text      TEXT NOT NULL,
      analyzed  INTEGER NOT NULL DEFAULT 0,
      emotion   TEXT,
      keywords  TEXT,
      summary   TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_userId ON journals(userId);
  `);

  persist(); // save initial structure
  return db;
}

// Persist in-memory DB to disk after every write
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDb() {
  if (!db) throw new Error("DB not initialised yet");
  return db;
}

module.exports = { initDb, getDb, persist };
