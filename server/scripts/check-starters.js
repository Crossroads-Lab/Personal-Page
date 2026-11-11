"use strict";
/**
 * Check every starter, and optionally ask it.
 *
 *   npm --prefix server run check-starters           free: resolve the corpus
 *   npm --prefix server run check-starters -- --ask  also ask the engine
 *
 * A chip is a promise: the page offered the question, so it must not answer
 * "I haven't written that up". One sat in the pool for a day doing exactly
 * that — the corpus had no section written as an answer to it, which no
 * amount of retrieval tuning fixes. This is how that gets caught before a
 * visitor does.
 *
 * Since a chip now carries a preloaded answer (server/server/starters.js),
 * the thing most worth checking is free: does every starter still resolve to
 * the corpus sections it names? A heading renamed during an edit does not
 * break anything loudly — that starter quietly drops back to the engine and
 * gets slower and vaguer, which is exactly the kind of regression nobody
 * notices. This catches it for nothing.
 *
 * --ask is the old behaviour and still worth running after a corpus edit:
 * the preloaded text only covers a visitor who presses the chip, and plenty
 * of them will type the same question in their own words instead. That path
 * is still retrieval and Claude, and it can still duck. One Claude call per
 * starter, so it is not a test to run on a loop.
 */
require("../config");
require("llms/src/xenova/env");
const CONFIG = require("../config");
const buildStarters = require("../server/starters").build;

const ASK = process.argv.includes("--ask");

/* Phrases that mean "the corpus does not have this". Matched loosely, on
 * purpose: a near-miss here is a prompt to go and read the answer. */
const DUCKS = [
  "haven't written", "have not written", "not written up", "don't have that",
  "rather not guess", "rather not say", "haven't put", "no idea",
];

(async () => {
  // ── Free pass: does every chip still have its answer? ──────────────────
  const starters = await buildStarters();
  const entries = starters.all();
  const unresolved = entries.filter(e => !e.a);

  for (const e of entries) {
    console.log(`${e.a ? "ok    " : "NO SRC"}  ${e.label}`);
    console.log(`        ${e.q}`);
    if (e.a) {
      console.log(`        ${e.a.length} chars, ${e.followUpQuestions.length} follow-ups`);
    } else {
      console.log(`        no preloaded answer — falls back to the engine`);
    }
  }

  console.log(
    `\n${entries.length - unresolved.length}/${entries.length} resolve to the corpus.`);
  if (unresolved.length) {
    console.log("A starter with no source is a chip that got slower and vaguer");
    console.log("without anyone noticing. Check `from` in server/config.js.");
  }

  if (!ASK) {
    console.log("\nRun with -- --ask to also put each one through the engine.");
    process.exit(unresolved.length ? 1 : 0);
  }

  // ── Paid pass: what a visitor gets if they type it instead ─────────────
  const getEngine = require("../server/engine");
  const engine = await getEngine();
  let bad = 0;

  for (const { label, q } of entries) {
    const r = await engine.ask(q);
    const text = (r.answer || []).map(c => c.text).join(" ").trim();
    const ducked = DUCKS.some(d => text.toLowerCase().includes(d));
    const sources = [...new Set(
      (r.answer || []).map(c => c?.source?.documentId).filter(Boolean)
    )];

    if (ducked) ++bad;
    console.log(`\n${ducked ? "DUCKED" : "ok    "}  ${label}`);
    console.log(`        ${q}`);
    console.log(`        sources: ${sources.join(", ") || "NONE"}`);
    console.log(`        ${text.slice(0, 150)}${text.length > 150 ? "…" : ""}`);
  }

  console.log(`\n${entries.length - bad}/${entries.length} answered, ${bad} ducked.`);
  if (bad) console.log("A ducked starter is a question the page should not be offering.");
  process.exit(bad || unresolved.length ? 1 : 0);
})();
