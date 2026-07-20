const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
app.use(express.json({ limit: "20kb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 4000,
  idleTimeoutMillis: 10000,
  max: 5
});

const TABLE = "stephan_entries";
const SCORES = "stephan_scores";
const DB_TIMEOUT_MS = 4500;

function dbQuery(text, values = []) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Database timeout")), DB_TIMEOUT_MS);
    pool.query(text, values)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

async function ensureTables() {
  await dbQuery("CREATE TABLE IF NOT EXISTS " + TABLE + " (id SERIAL PRIMARY KEY, name TEXT NOT NULL, msg TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await dbQuery("CREATE TABLE IF NOT EXISTS " + SCORES + " (id SERIAL PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
}

ensureTables().catch((error) => console.error("Database setup unavailable:", error.message));

function entryInput(body) {
  const name = String(body.name || "").trim().slice(0, 60);
  const msg = String(body.msg || "").trim().slice(0, 8000);
  return { name, msg };
}

async function listEntries() {
  const result = await dbQuery("SELECT id, name, msg FROM " + TABLE + " ORDER BY id DESC LIMIT 500");
  return result.rows;
}

async function listScores() {
  const result = await dbQuery("SELECT id, name, score FROM " + SCORES + " ORDER BY score DESC, id ASC LIMIT 100");
  return result.rows;
}

app.get("/api/entries", async (_req, res) => {
  try {
    res.json({ entries: await listEntries() });
  } catch (error) {
    console.error("Entries unavailable:", error.message);
    res.sendStatus(503);
  }
});

app.post("/api/entries", async (req, res) => {
  try {
    const { name, msg } = entryInput(req.body || {});
    if (!name || !msg) return res.status(400).json({ error: "missing" });
    await dbQuery("INSERT INTO " + TABLE + " (name, msg) VALUES ($1, $2)", [name, msg]);
    res.json({ entries: await listEntries() });
  } catch (error) {
    console.error("Entry save failed:", error.message);
    res.sendStatus(503);
  }
});

app.delete("/api/entries/:id", async (req, res) => {
  try {
    if (!process.env.ADMIN_TOKEN || req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: "forbidden" });
    }
    await dbQuery("DELETE FROM " + TABLE + " WHERE id = $1", [req.params.id]);
    res.json({ entries: await listEntries() });
  } catch (error) {
    console.error("Entry delete failed:", error.message);
    res.sendStatus(503);
  }
});

app.get("/api/scores", async (_req, res) => {
  try {
    res.json({ scores: await listScores() });
  } catch (error) {
    console.error("Scores unavailable:", error.message);
    res.sendStatus(503);
  }
});

app.post("/api/scores", async (req, res) => {
  try {
    const name = String((req.body || {}).name || "").trim().slice(0, 30);
    const score = Math.max(0, Math.min(999999, Math.floor(Number((req.body || {}).score))));
    if (!name || !Number.isFinite(score)) return res.status(400).json({ error: "missing" });
    await dbQuery("INSERT INTO " + SCORES + " (name, score) VALUES ($1, $2)", [name, score]);
    res.json({ scores: await listScores() });
  } catch (error) {
    console.error("Score save failed:", error.message);
    res.sendStatus(503);
  }
});

app.delete("/api/scores/all", async (req, res) => {
  try {
    if (!process.env.ADMIN_TOKEN || req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: "forbidden" });
    }
    await dbQuery("DELETE FROM " + SCORES);
    res.json({ scores: [] });
  } catch (error) {
    console.error("Score cleanup failed:", error.message);
    res.sendStatus(503);
  }
});

app.delete("/api/scores/:id", async (req, res) => {
  try {
    if (!process.env.ADMIN_TOKEN || req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: "forbidden" });
    }
    await dbQuery("DELETE FROM " + SCORES + " WHERE id = $1", [req.params.id]);
    res.json({ scores: await listScores() });
  } catch (error) {
    console.error("Score delete failed:", error.message);
    res.sendStatus(503);
  }
});

app.get(["/", "/index.html"], (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/stephan.png", (_req, res) => res.sendFile(path.join(__dirname, "stephan.png")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Stephan app listening on " + port));
