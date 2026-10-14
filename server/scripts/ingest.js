"use strict";

/**
 * Ingest: data/markdowns/<theme>/<stem>.md → data/vectorized-dataset/<theme>/<stem>.bin
 *
 * Mirrors ask-nereus-server's build path: extractSections → augmentSections
 * → encodeSections. Augmentation is what generates the question/anchor/variant
 * vectors that make abstract queries ("how do you handle disagreement?") land
 * on the right section, so it's on by default.
 *
 *   npm run ingest              # all files
 *   npm run ingest -- --no-augment   # skip LLM augmentation (fast, cheaper, weaker retrieval)
 *   npm run ingest -- career/snap.md # one file
 */


const fs   = require("fs").promises;
const path = require("path");

const CONFIG           = require("../config");

// AFTER config: config sets XENOVA_CACHE_DIR, which this reads to locate
// the ONNX model cache outside node_modules.
require("llms/src/xenova/env");
const buildBinary      = require("llms/src/actions/generate/binary");
const vectorize        = require("llms/src/xenova/vectorize");
const claudeRun        = require("llms/src/claude");
const deriveDocumentId = require("llms/src/utilities/deriveDocumentId");
const makeLimit        = require("llms/src/utilities/makeLimit");
const manifest         = require("./manifest");

const args      = process.argv.slice(2);
const noAugment = args.includes("--no-augment");
const targets   = args.filter(a => !a.startsWith("--"));

/** Recursively collect every .md under dir. */
const walkMarkdown = async (dir) => {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
};

const main = async () => {
  const files = targets.length
    ? targets.map(t => path.resolve(CONFIG.MARKDOWNS, t))
    : await walkMarkdown(CONFIG.MARKDOWNS);

  if (!files.length) {
    console.error("No markdown found under", CONFIG.MARKDOWNS);
    process.exit(1);
  }

  // Probe the embedding dimension once — encodeSections needs it up front.
  const probe  = await vectorize("dimension probe");
  const vecDim = probe.length;
  console.log(`Embedding model ready — ${vecDim} dimensions.`);

  const augmentPrompt = noAugment ? null : await fs.readFile(CONFIG.AUGMENT_PROMPT, "utf8");
  console.log(noAugment
    ? "Augmentation OFF — breadcrumb + body vectors only."
    : `Augmentation ON — ${CONFIG.SONNET55.model}.`);

  // Shared limiter so total in-flight LLM calls stay bounded across all files.
  const limit = makeLimit(4);

  // Augmentation failures are per-section soft errors: the document still
  // builds, just without question/anchor/variant vectors. Without this
  // tally a fully-failed augmentation run reports "N built, 0 failed"
  // while silently producing breadcrumb-only bins.
  const softErrors = {};

  const inputs = await Promise.all(files.map(async (file) => ({
    file,
    markdown:   await fs.readFile(file, "utf8"),
    documentId: deriveDocumentId(file),
    vecDim,
    vectorize,
    ...(augmentPrompt ? {
      runLLM:    claudeRun,
      prompt:    augmentPrompt,
      llmConfig: CONFIG.SONNET55,
      limit,
    } : {}),
    onError: ({ stage, sectionIndex, cause }) => {
      // documentId matters more than sectionIndex here: without it a failure
      // report can't be turned into a targeted re-run.
      const first = cause.message.split(";")[0].replace(/^runWithRetry: /, "");
      const id = deriveDocumentId(file);
      console.warn(`  soft error [${stage}] ${id} §${sectionIndex}: ${first}`);
      (softErrors[stage] ||= []).push({ documentId: id, file, sectionIndex });
    },
  })));

  console.log(`\nBuilding ${inputs.length} document(s)…\n`);
  const results = await buildBinary.batch(inputs);

  let ok = 0, failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r     = results[i];
    const input = inputs[i];

    if (r.status === "rejected") {
      failed++;
      console.error(`  ✗ ${input.documentId} — [${r.reason.stage}] ${r.reason.message}`);
      continue;
    }

    // Bin path mirrors the markdown path so deriveDocumentId(bin) === documentId.
    const rel     = path.relative(CONFIG.MARKDOWNS, input.file).replace(/\.md$/, ".bin");
    const binPath = path.join(CONFIG.DATASET, rel);
    await fs.mkdir(path.dirname(binPath), { recursive: true });
    await fs.writeFile(binPath, r.value);

    ok++;
    console.log(`  ✓ ${input.documentId.padEnd(42)} ${(r.value.length / 1024).toFixed(1)} KB`);
  }

  // Record what the bins were built from, so a later markdown edit is
  // detectable instead of silently corrupting section ranges.
  if (ok) {
    const m = await manifest.write();
    console.log(`\nManifest written — ${Object.keys(m.documents).length} documents.`);
  }

  console.log(`Done. ${ok} built, ${failed} failed.`);

  const augFails = softErrors.augment || [];
  if (augmentPrompt && augFails.length) {
    // Group by file so the retry command is copy-pasteable.
    const byFile = new Map();
    for (const f of augFails) {
      byFile.set(f.file, (byFile.get(f.file) || 0) + 1);
    }
    const rel = [...byFile].map(([f, n]) =>
      `${path.relative(CONFIG.MARKDOWNS, f)} (${n})`);

    console.error(
      `\n  WARNING: ${augFails.length} section(s) across ${byFile.size} document(s) ` +
      `failed augmentation.\n` +
      `  Those sections carry breadcrumb + body vectors only, so abstract\n` +
      `  queries will retrieve them less well.\n\n` +
      `  Affected: ${rel.join(", ")}\n\n` +
      `  Retry just those (ingest is idempotent):\n` +
      `    npm run ingest -- ${[...byFile.keys()].map(f => path.relative(CONFIG.MARKDOWNS, f)).join(" ")}`
    );
    process.exit(2);
  }

  if (failed) process.exit(1);
};

main().catch(err => {
  console.error("\nIngest failed:", err);
  process.exit(1);
});
