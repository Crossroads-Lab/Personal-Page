"use strict";
/**
 * Ask every starter and show what comes back.
 *
 *   npm --prefix server run check-starters
 *
 * A chip is a promise: the page offered the question, so it must not answer
 * "I haven't written that up". One sat in the pool for a day doing exactly
 * that — the corpus had no section written as an answer to it, which no
 * amount of retrieval tuning fixes. This is how that gets caught before a
 * visitor does.
 *
 * Costs one Claude call per starter, so it is not a test to run on a loop.
 */
require("../config");
require("llms/src/xenova/env");
const CONFIG = require("../config");
const getEngine = require("../server/engine");

/* Phrases that mean "the corpus does not have this". Matched loosely, on
 * purpose: a near-miss here is a prompt to go and read the answer. */
const DUCKS = [
  "haven't written", "have not written", "not written up", "don't have that",
  "rather not guess", "rather not say", "haven't put", "no idea",
];

(async () => {
  const engine = await getEngine();
  const starters = CONFIG.STARTERS;
  let bad = 0;

  for (const { label, q } of starters) {
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

  console.log(`\n${starters.length - bad}/${starters.length} answered, ${bad} ducked.`);
  if (bad) console.log("A ducked starter is a question the page should not be offering.");
  process.exit(bad ? 1 : 0);
})();
