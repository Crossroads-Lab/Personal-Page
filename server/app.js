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

/**
 * A few opener questions, sampled without replacement so one response never
 * shows the same question twice. Partial Fisher-Yates over a copy — the pool
 * is small and this runs once per greeting, so clarity beats cleverness.
 */
const pickStarters = () => {
  const pool = [...(CONFIG.STARTERS || [])];
  const n = Math.min(CONFIG.STARTER_COUNT ?? 3, pool.length);
  for (let i = 0; i < n; ++i) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
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

      // Paths that skip retrieval — greeting, off-topic decline, fallback —
      // come back from the library with no follow-ups, which leaves the
      // visitor facing an empty input box at the one moment they have least
      // idea what to ask. Offer curated openers instead.
      if (!body.followUpQuestions?.length) body.followUpQuestions = pickStarters();

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
