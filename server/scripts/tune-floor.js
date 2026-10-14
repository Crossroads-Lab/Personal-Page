"use strict";

/**
 * Sweep the retrieval cosine floor against a labeled query set.
 * Retrieval only — no LLM calls, no cost.
 *
 *   npm run tune-floor
 *
 * Reports, per floor value:
 *   hit@1 / hit@3  — did the expected document rank first / in the top three
 *   rows           — mean rows returned for on-topic queries (context cost)
 *   offtopic       — share of off-topic queries correctly returning nothing
 *
 * Pick the highest floor that holds hit@3, since rows fall and off-topic
 * precision rises monotonically with it.
 */

require("../llms/src/xenova/env");

const CONFIG          = require("../config");
const VectorStore     = require("../llms/src/VectorStore");
const SectionResolver = require("../llms/src/actions/query/SectionResolver");
const buildAnalyze    = require("../llms/src/xenova/buildAnalyzeQuery");
const search          = require("../llms/src/VectorStore/search");
const unionHits       = require("../llms/src/actions/query/unionHits");
const prewarm         = require("../llms/src/xenova/prewarm");
const { MAX_OUTPUT_ROWS } = require("../llms/src/VectorStore/constants");

// expected === null means "should retrieve nothing".
const GOLDEN = [
  ["what did you do at Snap?",                     "career|snap"],
  ["tell me about iScribeHealth",                  "career|iscribehealth"],
  ["what did you build at Amazon?",                "career|amazon_a9"],
  ["tell me about your PhD",                       "background|education_and_research"],
  ["how do you handle disagreement with your team?","stories|snap_beauty_score_filter"],
  ["tell me about a time you failed",              "stories|heali_overbuilt_before_validating"],
  ["how big was your team at Heali?",              "stories|heali_early_team"],
  ["how can I get in touch?",                      "logistics|contact_and_links"],
  ["what are you looking for in a role?",          "logistics|what_im_looking_for"],
  ["why did you leave iScribeHealth?",             "logistics|why_i_left_iscribehealth"],
  ["what's your favorite book?",                   "perspective|influences"],
  ["how do you feel about firing people?",         "perspective|firing_and_accountability"],
  ["what would you do in your first 90 days?",     "perspective|first_90_days"],
  ["thoughts on an 80 hour work week?",            "perspective|work_hours"],
  ["where do you see healthcare AI going?",        "perspective|future_of_healthcare_ai"],
  ["what's the capital of France?",                null],
  ["write me a poem about cats",                   null],
  ["what is 2 + 2?",                               null],
  ["what's the weather today?",                    null],
];

const FLOORS = [0.70, 0.72, 0.74, 0.76, 0.78, 0.80, 0.82, 0.84];

const main = async () => {
  await prewarm(CONFIG.PREWARM);
  const [store, resolver] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
  ]);
  const analyze = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  // Analyze once — the analysis is floor-independent, so this keeps the
  // sweep measuring retrieval rather than re-embedding 19 queries per floor.
  const analyzed = [];
  for (const [q, expected] of GOLDEN) {
    const a = await analyze(q);
    analyzed.push({ q, expected, a });
  }

  console.log(`\n${store.length} documents.  ${GOLDEN.filter(g => g[1]).length} on-topic, ` +
              `${GOLDEN.filter(g => !g[1]).length} off-topic.\n`);
  console.log("  floor   hit@1   hit@3    rows   offtopic-clean");
  console.log("  " + "-".repeat(48));

  for (const floor of FLOORS) {
    let h1 = 0, h3 = 0, onTopic = 0, rowSum = 0, offClean = 0, offTotal = 0;

    for (const { expected, a } of analyzed) {
      const segs = a.segments.filter(s => s.classification?.label !== "CONVERSATIONAL");
      const hits = unionHits(segs.map(s => search(store, s.vec, { floor })));

      const rows = [];
      for (const h of hits) {
        if (resolver.resolve(h.documentId, h.range) !== null) rows.push(h);
      }
      const top = rows.slice(0, MAX_OUTPUT_ROWS);

      if (expected === null) {
        offTotal++;
        if (top.length === 0) offClean++;
      } else {
        onTopic++;
        rowSum += top.length;
        if (top[0]?.documentId === expected) h1++;
        if (top.slice(0, 3).some(r => r.documentId === expected)) h3++;
      }
    }

    const pct = (n, d) => d ? `${Math.round(100 * n / d)}%`.padStart(4) : "  — ";
    console.log(
      `  ${floor.toFixed(2)}    ${pct(h1, onTopic)}    ${pct(h3, onTopic)}   ` +
      `${(rowSum / onTopic).toFixed(1).padStart(5)}   ${pct(offClean, offTotal)}`
    );
  }
  console.log();
};

main().catch(e => { console.error(e); process.exit(1); });
