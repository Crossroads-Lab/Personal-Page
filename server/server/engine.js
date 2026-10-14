"use strict";

/**
 * Boot-time resource loading + a single `ask()` entry point, shared by the
 * HTTP server and the CLI.
 *
 * Everything heavy — the ONNX embedding model, the VectorStore, the
 * SectionResolver, the answer prompt — loads once per process and stays
 * resident. Nothing here is per-request.
 */


const fs = require("fs").promises;

const CONFIG          = require("../config");

// AFTER config: config sets XENOVA_CACHE_DIR, which this reads to locate
// the ONNX model cache outside node_modules.
require("llms/src/xenova/env");
const VectorStore     = require("llms/src/VectorStore");
const SectionResolver = require("llms/src/actions/query/SectionResolver");
const buildAnalyze    = require("llms/src/xenova/buildAnalyzeQuery");
const runQuery        = require("llms/src/actions/query");
const prewarm         = require("llms/src/xenova/prewarm");
const claudeRun       = require("llms/src/claude");
const manifest        = require("../scripts/manifest");

let enginePromise;

const build = async () => {
  const started = Date.now();

  // Only the feature-extraction model. See CONFIG.PREWARM.
  await prewarm(CONFIG.PREWARM);

  // Fail fast on a stale corpus. Section ranges are byte offsets into the
  // markdown; if the markdown moved, the resolver returns misaligned text
  // rather than an error, and the model fabricates to bridge the gaps.
  // Refusing to start is strictly better than answering wrongly in his name.
  const integrity = await manifest.verify();
  if (!integrity.ok) {
    const detail = [
      ...integrity.stale.map(id => `stale (edited since ingest): ${id}`),
      ...integrity.missing.map(id => `missing markdown: ${id}`),
      ...integrity.untracked.map(id => `never ingested: ${id}`),
    ];
    throw new Error(
      `Corpus is out of sync with the vector store` +
      (integrity.reason ? ` (${integrity.reason})` : "") + ".\n  " +
      (detail.join("\n  ") || "") +
      "\n\n  Section ranges are byte offsets into the markdown, so serving " +
      "this would\n  return misaligned text and invite fabricated answers. " +
      "Run: npm run ingest"
    );
  }

  const [store, resolver, answerPrompt] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
    fs.readFile(CONFIG.ANSWER_PROMPT, "utf8"),
  ]);

  // Mode 1 with domain anchors, NLI disabled. See CONFIG.CLASSIFIER.
  const analyzeQuery = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  const boot = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Engine ready in ${boot}s — ${store.length} documents, ${store.vecDim} dimensions.`);

  const ask = (rawQuery) => runQuery({
    rawQuery,
    store,
    resolver,
    analyzeQuery,
    runLLM:           claudeRun,
    prompts:          { answer: answerPrompt },
    llmConfig:        CONFIG.HAIKU55,
    searchOptions:    CONFIG.RETRIEVAL,
    greetingTemplate: CONFIG.GREETING,
    fallbackAnswer:   CONFIG.FALLBACK,
  });

  return { ask, store, resolver, analyzeQuery };
};

/** Idempotent — the first call builds, every later call returns the same engine. */
const getEngine = () => enginePromise || (enginePromise = build());

module.exports = Object.freeze(Object.defineProperty(getEngine, "getEngine", {
  value: getEngine,
}));
