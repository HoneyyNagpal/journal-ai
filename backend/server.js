require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { initDb } = require("./db/database");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use("/api/journal/analyze", rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Analyze limit reached. Try again in an hour." },
}));

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Init DB first, then load routes and start server
initDb().then(() => {
  const journalRoutes = require("./routes/journal");
  app.use("/api/journal", journalRoutes);
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}).catch((err) => {
  console.error("Failed to initialise database:", err);
  process.exit(1);
});
