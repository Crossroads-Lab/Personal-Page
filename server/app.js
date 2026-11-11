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
const { filterAsked } = require("./server/asked");
const history = require("./server/history");
const { actionsFor, warm: warmActions } = require("./server/actions");
const buildStarters = require("./server/starters").build;
const { logQuery } = require("./server/log");

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
  // Build the engine BEFORE listening so the first visitor never pays boot
  // cost — and warm the action anchors in the same breath, for the same
  // reason: they are a fixed set, embedded once.
  const engine = await getEngine();
  await warmActions();

  // Reads the corpus sections named by CONFIG.STARTERS[].from and keeps
  // them in memory as finished answers. See server/starters.js: a chip is
  // a question we wrote the corpus to answer, so answering it costs
  // nothing and should not make anyone wait.
  const starters = await buildStarters();

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

  // Opening suggestions for a visitor who has not asked anything yet —
  // and the answer to each one, already written.
  //
  // Deliberately its own endpoint rather than a greeting through /query:
  // this touches neither Claude nor the embedding model, so it is free and
  // instant, and it is not worth spending a rate-limit slot on. The page
  // carries its own fallback list, so a failure here costs nothing.
  //
  // Shipping the answer with the chip is what makes pressing one feel like
  // opening a page rather than asking a question: there is no second
  // request, so there is nothing to wait for. And not just the chip: the
  // tree of follow-ups under it comes too, four levels down, so a visitor
  // can read a whole thread without the page asking for anything. Edges
  // stay inside one document, so that subgraph is a few KB — smaller than
  // one of the page's icons.
  app.get("/starters", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(starters.pick(CONFIG.STARTER_COUNT ?? 3));
  });

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

    // The page carries the transcript; there is no session store. Cleaned
    // and capped here, before anything downstream sees it.
    const past = history.clean(req.body?.history);
    const started = Date.now();

    // Already written, so don't buy it again.
    //
    // Reached when a visitor types a starter out rather than pressing it, or
    // when the page's /starters call failed and it fell back to its own list
    // of questions — in which case the chips have no answer attached and ask
    // the normal way. Same text either way; this one just costs nothing.
    // A question the page offered as a chip.
    //
    // Every chip comes from the corpus now — a starter, or a heading from
    // the document an answer was built from — so pressing one is a visitor
    // choosing a question we wrote, and the answer is the section under it.
    // Served as written: no retrieval, no model, no cost.
    //
    // Gated on the page saying so rather than on the text alone, because a
    // heading is not always a self-contained question. "Did you fix it?"
    // pressed under the outage story is unambiguous; typed into the box
    // halfway through a conversation about something else it is not, and
    // that one belongs to retrieval.
    if (req.body?.chip === true) {
      const section = starters.sectionFor(query);
      if (section) {
        const asked = [...past.map(turn => turn.q), query];
        const seen = new Set(asked.map(a => a.trim().toLowerCase()));
        const followUpQuestions = section.siblings
          .filter(h => !seen.has(h.trim().toLowerCase()))
          .slice(0, 3);

        logQuery({
          ms: Date.now() - started, query, intent: "chip",
          sources: ["corpus"], followUps: followUpQuestions,
          actions: [], turns: past.length,
        }, CONFIG.QUERY_LOG);

        return res.json({
          answer: [{ text: section.a }],
          followUpQuestions,
          actions: [],
        });
      }
    }

    const preloaded = starters.answerFor(query);
    if (preloaded) {
      logQuery({
        ms: Date.now() - started,
        query,
        intent: "starter",
        sources: ["preloaded"],
        followUps: preloaded.followUpQuestions,
        actions: preloaded.actions,
        turns: past.length,
      }, CONFIG.QUERY_LOG);

      return res.json({
        answer: [{ text: preloaded.a }],
        followUpQuestions: preloaded.followUpQuestions,
        actions: preloaded.actions,
      });
    }

    try {
      const result = await engine.ask(query, { history: past });
      const { stats, ...body } = result;

      const asked = [...past.map(t => t.q), query];

      // Follow-ups come from the corpus, not from the model.
      //
      // A chip is a promise — the page offered the question, so there had
      // better be an answer behind it. The model writes follow-ups from the
      // answer it just produced and has no idea what else is in the corpus,
      // so it writes plausible next questions, and a plausible question the
      // corpus does not cover is a chip that leads straight to "I haven't
      // written that up". Seen live: an answer about raising problems early
      // offered "How do you handle an engineer's work you think is headed
      // the wrong way?", which nothing here answers.
      //
      // The answer cites which documents it was built from, so instead we
      // offer the other sections of those documents — questions the author
      // wrote, beside the material just quoted, each of which has an answer
      // because it IS one. See server/starters.js. Costs nothing.
      const cited = (body.answer || []).map(chunk => chunk?.source).filter(Boolean);
      body.followUpQuestions = starters.followUpsFor(cited, asked);

      // Paths that cite nothing — greeting, off-topic decline, fallback —
      // leave the visitor facing an empty input box at the one moment they
      // have least idea what to ask. Offer the openers instead, which are
      // answerable by definition, minus anything already been through.
      //
      // Follow-ups are plain strings on the wire; the starters carry a chip
      // label the answer screen has no use for, so only the question travels.
      if (!body.followUpQuestions.length) {
        body.followUpQuestions =
          await filterAsked(
            starters.pick(CONFIG.STARTER_COUNT ?? 3).starters.map(s => s.q), asked);
      }

      // Buttons that go where the question asked to go — the resume, the
      // calendar, LinkedIn. Decided here from the question rather than by
      // the model: see server/actions.js for why, and for the measured
      // threshold. Costs one embedding and no money.
      body.actions = await actionsFor(query);

      // An answer built from the book chapter always offers the book.
      //
      // Matching the question against phrasings is the right mechanism for
      // "where's your CV" and the wrong one here: the chapter answers are
      // teasers, so the questions that most need the button are about
      // privacy, or research, or where AI actually works — none of which
      // look like "buy your book" to an embedding. What they have in common
      // is not their wording, it is their source. So key it on the source.
      //
      // Costs nothing: the citations are already in hand.
      const fromTheBook = (body.answer || [])
        .some(chunk => chunk?.source?.documentId === "background|book");
      if (fromTheBook && !body.actions.includes("thebook")) {
        body.actions = ["thebook", ...body.actions].slice(0, 2);
      }

      // One line per question. The cited documentIds are the point: a wrong
      // answer is nearly always a retrieval miss, and without them there is
      // nothing to look at afterwards. See server/log.js for what is left
      // out, and why the IP is one of those things.
      logQuery({
        ms:        Date.now() - started,
        query,
        intent:    result.user_intent,
        sources:   [...new Set(
          (body.answer || []).map(c => c?.source?.documentId).filter(Boolean)
        )],
        followUps: body.followUpQuestions,
        actions:   body.actions,
        turns:     past.length,
      }, CONFIG.QUERY_LOG);

      res.json(body);
    } catch (err) {
      console.error("query:", err.message);
      res.status(500).json({ error: "Internal error", answer: [{ text: CONFIG.FALLBACK }] });
    }
  });

  const server = app.listen(CONFIG.PORT, () => {
    console.log(`Listening on http://localhost:${CONFIG.PORT}`);
    console.log(`  POST /query   GET /health`);
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  //
  // A deploy restarts this process, and systemd sends SIGTERM. Without a
  // handler Node exits immediately and every in-flight request dies — which
  // here means a visitor watching an answer type out gets a dead connection,
  // after we have already paid Anthropic for the answer.
  //
  // So: stop accepting new connections, let the ones in progress finish, then
  // exit 0. A query is one Claude call, normally ~6s; the cap is generous
  // enough for a slow one and short enough that a deploy is not held hostage.
  // systemd's own TimeoutStopSec must exceed SHUTDOWN_GRACE_MS or it will
  // SIGKILL us mid-drain and undo the point of this.
  const SHUTDOWN_GRACE_MS = 25_000;
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;          // a second signal must not restart the clock
    shuttingDown = true;
    console.log(`${signal} — draining, then exiting.`);

    // Stop accepting new connections; those already in flight run to
    // completion. /health deliberately keeps answering ok — there is no load
    // balancer to drain from, and Caddy proxies to this box either way, so a
    // readiness flag would have nothing reading it.
    server.close(() => {
      console.log("Drained cleanly.");
      process.exit(0);
    });

    // Backstop: a wedged request must not hold the deploy open forever.
    const timer = setTimeout(() => {
      console.error(`Still busy after ${SHUTDOWN_GRACE_MS}ms — exiting anyway.`);
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    timer.unref();                      // never let this timer keep us alive
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  return server;
};

main().catch(err => {
  console.error("Failed to start:", err);
  process.exit(1);
});
