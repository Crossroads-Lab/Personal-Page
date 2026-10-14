"use strict";

/**
 * Retrieval-only diagnostic — no API key, no Claude call, no cost.
 *
 * Runs analyze → search → resolve and prints exactly the context block that
 * would be handed to the answer prompt. Use this to tune the corpus and the
 * classifier without spending tokens.
 *
 *   npm run retrieve -- "how do you handle disagreement?"
 */


const CONFIG              = require("../config");

// AFTER config: config sets XENOVA_CACHE_DIR, which this reads to locate
// the ONNX model cache outside node_modules.
require("llms/src/xenova/env");
const VectorStore         = require("llms/src/VectorStore");
const SectionResolver     = require("llms/src/actions/query/SectionResolver");
const buildAnalyze        = require("llms/src/xenova/buildAnalyzeQuery");
const search              = require("llms/src/VectorStore/search");
const unionHits           = require("llms/src/actions/query/unionHits");
const serializeQueryContext = require("llms/src/xenova/serializeQueryContext");
const prewarm             = require("llms/src/xenova/prewarm");
const { MAX_OUTPUT_ROWS } = require("llms/src/VectorStore/constants");

const QUERIES = process.argv.slice(2).length
  ? [process.argv.slice(2).join(" ")]
  : [
      "what did you do at Snap?",
      "how do you handle disagreement with your team?",
      "how can I get in touch?",
      "hi there",
      "what's the capital of France?",
      "tell me about your PhD",
      "have you worked on healthcare?",
      "what's your opinion on remote work?",
    ];

const main = async () => {
  await prewarm(CONFIG.PREWARM);

  const [store, resolver] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
  ]);
  const analyzeQuery = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  console.log(`Loaded ${store.length} documents, ${store.vecDim} dimensions.\n`);
  console.log("=".repeat(78));

  for (const q of QUERIES) {
    const analysis = await analyzeQuery(q);

    const searchable = analysis.segments.filter(s =>
      s.classification?.label !== "CONVERSATIONAL"
    );

    const hits = unionHits(await Promise.all(
      searchable.map(seg => search(store, seg.vec, CONFIG.RETRIEVAL))
    ));

    const enriched = [];
    for (const hit of hits) {
      const text = resolver.resolve(hit.documentId, hit.range);
      if (text !== null) enriched.push({ ...hit, sectionText: text });
    }
    const results = enriched.slice(0, MAX_OUTPUT_ROWS);

    console.log(`\nQUERY: ${q}`);
    console.log(`  corrected: ${analysis.corrected}`);
    console.log(`  greeting: ${analysis.greeting}   intent: ${serializeQueryContext.buildIntents(analysis)}`);
    console.log(`  segments: ${analysis.segments.map(s =>
      `"${s.text}" → ${s.classification?.label}(${s.classification?.confidence?.toFixed(2)})`
    ).join("  |  ") || "none"}`);
    console.log(`  retrieved: ${results.length}`);

    for (const r of results.slice(0, 4)) {
      const snippet = r.sectionText.replace(/\s+/g, " ").slice(0, 105);
      console.log(`    ${r.score.toFixed(3)}  ${r.documentId.padEnd(38)} ${snippet}…`);
    }
    if (!results.length) console.log("    (nothing — answer prompt takes the no-coverage path)");
    console.log("-".repeat(78));
  }
};

main().catch(err => { console.error(err); process.exit(1); });
