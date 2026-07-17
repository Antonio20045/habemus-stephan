const express = require("express");
const { Pool } = require("pg");
const path = require("path");
const app = express();
app.use(express.json());
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });

app.get("/api/entries", async (_q, res) => {
  try { const r = await pool.query("SELECT id, name, msg FROM entries ORDER BY id DESC LIMIT 500"); res.json({ entries: r.rows }); }
  catch (e) { res.status(500).json({ error: "db" }); }
});
app.post("/api/entries", async (q, res) => {
  try {
    const name = String(q.body.name || "").trim().slice(0, 60);
    const msg = String(q.body.msg || "").trim().slice(0, 8000);
    if (!name || !msg) return res.status(400).json({ error: "missing" });
    await pool.query("INSERT INTO entries (name, msg) VALUES ($1, $2)", [name, msg]);
    const r = await pool.query("SELECT id, name, msg FROM entries ORDER BY id DESC LIMIT 500");
    res.json({ entries: r.rows });
  } catch (e) { res.status(500).json({ error: "db" }); }
});
// Optional moderation/cleanup: needs header x-admin-token matching env ADMIN_TOKEN.
app.delete("/api/entries/:id", async (q, res) => {
  try {
    if (!process.env.ADMIN_TOKEN || q.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: "forbidden" });
    await pool.query("DELETE FROM entries WHERE id = $1", [q.params.id]);
    const r = await pool.query("SELECT id, name, msg FROM entries ORDER BY id DESC LIMIT 500");
    res.json({ entries: r.rows });
  } catch (e) { res.status(500).json({ error: "db" }); }
});

app.get("/stephan.png", (_q, res) => res.sendFile(path.join(__dirname, "stephan.png")));
app.get("*", (_q, res) => res.sendFile(path.join(__dirname, "index.html")));

const port = process.env.PORT || 3000;

// Optional: keep the Render free instance awake by pinging itself every ~10 min.
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => { fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {}); }, 10 * 60 * 1000);
}

pool.query("CREATE TABLE IF NOT EXISTS entries (id SERIAL PRIMARY KEY, name TEXT NOT NULL, msg TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())").catch(() => {}).finally(() => app.listen(port, () => console.log("up " + port)));
