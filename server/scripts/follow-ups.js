"use strict";

/**
 * Build the follow-up graph for this corpus.
 *
 *   npm run follow-ups -- --limit 5        pilot: five sections, print, write nothing
 *   npm run follow-ups -- --questions-only a writing queue → data/follow-ups.md
 *   npm run follow-ups -- --questions-only --reuse   re-annotate it, free
 *   npm run follow-ups                     the whole corpus → data/follow-ups.json
 *   npm run follow-ups -- --floor 0.45     override the grounding threshold
 *
 * The stage itself lives in llms (`rag.buildFollowUps`) because none of it
 * is about this site. This script is the wiring: it turns this corpus into
 * the `{id, title, text}` list the stage wants, and this store into the
 * `search` function it wants.
 *
 * Costs two Sonnet calls per section — one writes every question, one
 * writes every answer — so a full pass over this corpus is roughly twice a
 * full `npm run ingest`. Run the pilot first and read what comes out.
 */

require("../config");
require("llms/src/xenova/env");

const fs   = require("fs").promises;
const path = require("path");

const CONFIG      = require("../config");
const VectorStore = require("llms/src/VectorStore");
const vectorize   = require("llms/src/xenova/vectorize");
const claudeRun   = require("llms/src/claude");
const makeLimit   = require("llms/src/utilities/makeLimit");
const prewarm     = require("llms/src/xenova/prewarm");
const buildAnalyze = require("llms/src/xenova/buildAnalyzeQuery");
const { buildGraph } = require("../server/starters");

const args  = process.argv.slice(2);
const flag  = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LIMIT = Number(flag("limit", 0));
const QUESTIONS_ONLY = args.includes("--questions-only");
// Annotate a queue already generated, instead of generating it again. The
// questions cost a model call each; the closest-match probe costs nothing,
// so re-running the cheap half should never re-run the expensive one.
const REUSE = args.includes("--reuse");
const FLOOR = Number(flag("floor", 0.55));
const OUT   = path.join(CONFIG.DATASET, "..", flag("out", "follow-ups.json"));

// This project's copies, not the library's.
//
// The same arrangement as prompts/augment-section.ppl: the library ships a
// generic default, and a site that cares about its own voice keeps its own.
// These two decide what every chip on the page says, so they belong where
// they can be edited and reviewed next to the corpus they describe.
const PROMPTS = {
  questions: path.join(__dirname, "../prompts/follow-up-questions.ppl"),
  answers:   path.join(__dirname, "../prompts/follow-up-answers.ppl"),
};

/**
 * Where to load the pipeline from.
 *
 * `rag.buildFollowUps` is new and not in the published llms yet, so point
 * LLMS_SRC at a checkout to run against a branch:
 *
 *   LLMS_SRC=~/Development/Projects/llms/src npm run follow-ups -- --limit 4
 *
 * Unset, this resolves the installed package exactly as everything else
 * does, and will keep working untouched once a release carries the stage.
 */
const LLMS_SRC = process.env.LLMS_SRC
  ? path.resolve(process.env.LLMS_SRC.replace(/^~/, process.env.HOME))
  : null;
const requireRag = () =>
  require(LLMS_SRC ? path.join(LLMS_SRC, "pipelines/rag") : "llms/src/pipelines/rag");

/** `documentId#heading` — unique across this corpus; headings already are. */
const sectionId = (documentId, heading) => `${documentId}#${heading}`;

const main = async () => {
  await prewarm(CONFIG.PREWARM);

  const [{ documents }, store, prompts] = await Promise.all([
    buildGraph(CONFIG.MARKDOWNS),
    VectorStore.create(CONFIG.DATASET),
    (async () => ({
      questions: await fs.readFile(PROMPTS.questions, "utf8"),
      answers:   await fs.readFile(PROMPTS.answers, "utf8"),
    }))(),
  ]);

  // ── This corpus, as the flat list the stage wants ────────────────────
  const sections = [];
  const locate   = new Map();          // documentId → [{start, end, id}]

  for (const [documentId, { sections: list }] of documents) {
    const spans = [];
    for (const section of list) {
      if (!section.body) continue;
      const id = sectionId(documentId, section.heading);
      sections.push({ id, title: section.heading, text: section.body });
      spans.push({ start: section.start, end: section.end, id });
    }
    locate.set(documentId, spans);
  }

  // A pilot spreads across the corpus rather than taking the first N.
  // The first N are all one document, and how well this works depends
  // entirely on how interconnected a document's subject is — four sections
  // about a book tell you nothing about four sections about a career.
  const stride = LIMIT > 0 ? Math.max(1, Math.floor(sections.length / LIMIT)) : 1;
  const chosen = LIMIT > 0
    ? sections.filter((_, i) => i % stride === 0).slice(0, LIMIT)
    : sections;
  console.log(
    `${sections.length} sections indexed` +
    (LIMIT > 0 ? `, running a pilot over ${chosen.length}` : "") +
    `; floor ${FLOOR}, ~${chosen.length * 2} model calls.\n`);

  // ── Retrieval, as the `search` the stage wants ───────────────────────
  //
  // The same path the live engine uses, not a bare store lookup. That
  // distinction turned out to be the whole ball game. Embedding a question
  // directly and scoring it against this corpus puts every section inside a
  // band of roughly 0.55–0.65 — so flat that an unrelated section about
  // moving to the US outranked "Did you fix it?" for "How did that night
  // turn out in the end?", and CONFIG.RETRIEVAL's floor of 0.7 would have
  // returned nothing at all. Query analysis is what separates them: it
  // splits the question into segments, drops the conversational ones, and
  // searches each on its own vector. See server/engine.js, which builds the
  // analyzer exactly this way.
  const analyzeQuery = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  const scores = [];
  const search = async (query, k, context) => {
    // The bare question first, and only then the question carrying its
    // asking section as context.
    //
    // Prefixing the section title unconditionally was a bug worth keeping
    // the shape of: the title is long and the question is short, so the
    // title dominated the embedding and every question asked from one
    // section retrieved the same hits at the same score. The tell was four
    // different questions scoring 0.625 to three decimal places.
    //
    // The questions are self-contained now — the prompt forbids leaning on
    // the section — so the bare form is the right query. Context is the
    // fallback for a question that still finds nothing alone, where a worse
    // query beats no query.
    const run = async (text) => {
      const analysis = await analyzeQuery(text);
      return (analysis.segments || [])
        .filter(seg => seg && seg.vec)
        .flatMap(seg => store.search(seg.vec, CONFIG.RETRIEVAL) || []);
    };

    let hits = await run(query);
    if (!hits.length && context && context.from && context.from.title) {
      hits = await run(`${context.from.title} ${query}`);
    }

    const best = new Map();

    for (const hit of hits) {
      const spans = locate.get(hit.documentId);
      if (!spans) continue;
      const start = Array.isArray(hit.range) ? hit.range[0] : null;
      const span = start === null
        ? null : spans.find(s => start >= s.start && start < s.end);
      if (!span) continue;
      if (hit.score > (best.get(span.id) ?? -Infinity)) best.set(span.id, hit.score);
    }

    const out = [...best.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    if (out.length) scores.push(out[0].score);     // for the distribution
    return out;
  };

  const started = Date.now();
  const rag = requireRag();

  // Questions only: the library's first half, on its own. One call per
  // section, no retrieval and no answering pass — which for this corpus is
  // the half that pays. Every section here is written as a complete answer
  // to its own heading, so there is rarely a second section to ground a
  // follow-up in; what is worth knowing is which questions nobody has
  // written an answer to yet.
  if (QUESTIONS_ONLY) {
    const { askNext, writingQueue, nearestSections } = rag.buildFollowUps;
    const saved = path.join(CONFIG.DATASET, "..", "follow-ups.questions.json");

    let questions, notes = [];
    if (REUSE) {
      questions = JSON.parse(await fs.readFile(saved, "utf8"));
      console.log(`Reusing ${Object.values(questions).flat().length} questions from ${saved}`);
    } else {
      ({ questions, notes } = await askNext({
        sections: chosen,
        runLLM: claudeRun,
        prompt: prompts.questions,
        config: CONFIG.SONNET55,
        limit: makeLimit(4),
        onNote: (note) => console.error(`  note  ${note.id} [${note.stage}] ${note.what}`),
      }));
      await fs.writeFile(saved, JSON.stringify(questions, null, 2) + "\n");
    }

    // What already sits closest to each one. Free, and not a verdict — see
    // nearestSections: the scores here are too flat to draw a line through,
    // so the queue shows the match and lets a person decide.
    const nearest = await nearestSections({
      questions, search, sections: chosen, limit: makeLimit(8),
    });

    const out = path.join(CONFIG.DATASET, "..", "follow-ups.md");
    await fs.writeFile(out, writingQueue(chosen, questions, {
      title: "What to write next",
      nearest,
      // Where to go and write it: the markdown file and the heading above
      // the one being extended.
      where: (section) => {
        const [documentId, heading] = section.id.split("#");
        return `data/markdowns/${documentId.replace("|", "/")}.md — after "## ${heading}"`;
      },
    }));

    const asked = Object.values(questions).flat().length;
    console.log(`\n${asked} questions across ${Object.keys(questions).length} of ${chosen.length} sections`);
    console.log(`${Math.round((Date.now() - started) / 1000)}s, ${notes.length} notes`);
    console.log(`Wrote ${out}`);
    return;
  }

  const { graph, index, links, gaps, notes } = await rag.buildFollowUps({
    sections: chosen,
    search,
    runLLM: claudeRun,
    prompts,
    config: CONFIG.SONNET55,
    floor: FLOOR,
    limit: makeLimit(4),
    onNote: (note) => console.error(`  note  ${note.id} [${note.stage}] ${note.what}`),
  });

  // ── What came out ────────────────────────────────────────────────────
  const rows = Object.values(graph).flat();
  console.log(`\n${rows.length} follow-ups across ${Object.keys(graph).length} sections`);
  console.log(`${links.length} links, ${gaps.length} gaps, ${notes.length} notes`);
  console.log(`${Math.round((Date.now() - started) / 1000)}s\n`);

  if (scores.length) {
    const sorted = [...scores].sort((a, b) => a - b);
    const at = (p) => sorted[Math.floor(sorted.length * p)].toFixed(3);
    console.log(`best-match score  min ${at(0)}  p25 ${at(0.25)}  median ${at(0.5)}  p75 ${at(0.75)}  max ${sorted[sorted.length - 1].toFixed(3)}`);
    console.log(`(the floor is ${FLOOR} — if most questions are landing in gaps, this is why)\n`);
  }

  for (const [id, list] of Object.entries(graph)) {
    console.log(`── ${id}`);
    for (const row of list) {
      console.log(`   Q ${row.q}`);
      console.log(`   A ${row.a.replace(/\n+/g, " ").slice(0, 150)}${row.a.length > 150 ? "…" : ""}`);
      console.log(`     ← ${row.groundedIn.join(", ")}  (${row.score.toFixed(3)})\n`);
    }
  }

  if (gaps.length) {
    console.log("── gaps: questions readers will ask that nothing here answers");
    for (const gap of gaps) {
      console.log(`   ${gap.question}`);
      console.log(`     asked from ${gap.from}  best ${Number(gap.bestScore).toFixed(3)}${gap.declined ? "  (model declined)" : ""}`);
    }
    console.log();
  }

  // A pilot prints and writes nothing: the point is to read it first.
  if (LIMIT > 0) return console.log("Pilot — nothing written. Drop --limit for the full pass.");

  await fs.writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    floor: FLOOR,
    graph, index, links, gaps,
  }, null, 2) + "\n");
  console.log(`Wrote ${OUT}`);
};

main().catch(err => { console.error(err); process.exit(1); });
