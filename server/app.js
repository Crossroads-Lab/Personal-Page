"use strict";

/**
 * HTTP entry point.
 *
 *   POST /query   { q | question | query | message } → answer JSON
 *   GET  /health  → { ok, documents, uptime }
 *
 * No database, no auth, no upload endpoints — this serves one public corpus.
 */

const express = require("express");
const cors    = require("cors");

const CONFIG    = require("./config");
const getEngine = require("./server/engine");
const guard     = require("./server/guard");

const QUERY_KEYS = ["q", "question", "query", "message", "msg"];
const MAX_QUERY_CHARS = 1000;

const resolveQuery = (body) => {
  if (!body) return null;
  for (const key of QUERY_KEYS) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

const main = async () => {
  // Build the engine BEFORE listening so the first visitor never pays boot cost.
  const engine = await getEngine();

  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.use(cors({ origin: CONFIG.ALLOWED_ORIGIN }));

  // Trust exactly one proxy hop (Caddy/nginx terminating TLS in front of us).
  // Without this, req.ip is the proxy's address and every visitor shares one
  // rate-limit bucket. With a larger value, a client could spoof X-Forwarded-For
  // and mint unlimited identities.
  app.set("trust proxy", 1);

  app.get("/health", (_req, res) => res.json({
    ok: true,
    documents: engine.store.length,
    uptime: Math.round(process.uptime()),
    rss: Math.round(process.memoryUsage().rss / 1048576),
    ...guard.stats(),
  }));

  app.post("/query", async (req, res) => {
    const query = resolveQuery(req.body);

    if (!query) return res.status(400).json({ error: "Missing or empty query" });
    if (query.length > MAX_QUERY_CHARS) {
      return res.status(400).json({ error: `Query exceeds ${MAX_QUERY_CHARS} characters` });
    }

    // Rate limit before any model work — rejected requests must cost nothing.
    const verdict = guard.check(req.ip || "unknown");
    if (!verdict.ok) {
      res.set("Retry-After", String(verdict.retryAfter));
      return res.status(verdict.status).json({
        answer: [{ text: verdict.message }],
        followUpQuestions: [],
        rateLimited: true,
      });
    }

    try {
      const result = await engine.ask(query);
      const { stats, ...body } = result;
      res.json(body);
    } catch (err) {
      console.error("query:", err.message);
      res.status(500).json({ error: "Internal error", answer: [{ text: CONFIG.FALLBACK }] });
    }
  });

  app.listen(CONFIG.PORT, () => {
    console.log(`Listening on http://localhost:${CONFIG.PORT}`);
    console.log(`  POST /query   GET /health`);
  });
};

main().catch(err => {
  console.error("Failed to start:", err);
  process.exit(1);
});
