"use strict";

/**
 * Precomputed answers, and the tree of follow-ups underneath them.
 *
 * ── The idea ────────────────────────────────────────────────────────────
 *
 * Every heading in the corpus is a question, and the body under it is the
 * answer somebody already wrote. So for any question we have a section for,
 * there is nothing to work out at request time: no retrieval, no model, no
 * rewrite of text that was already right. The only reason to involve a model
 * is a question nobody anticipated.
 *
 * That holds one level down too, and the level below that. A section's
 * follow-ups are the other sections of the same document — questions the
 * author wrote on purpose, in order — and each of those has its own
 * siblings. Which makes the answerable part of this corpus a graph, and the
 * part a visitor is likely to walk a small, bounded subgraph of it.
 *
 * So we walk it at boot and hand the page the whole thing: the opening
 * chips, their answers, their follow-ups, those follow-ups' answers, and so
 * on to DEPTH. A visitor can go four questions deep without the page making
 * a single request, and without a model ever restating something the author
 * already said better.
 *
 * ── Why this is cheap ───────────────────────────────────────────────────
 *
 * Follow-up edges stay inside one document, so the subgraph under a chip is
 * at most that document — three to five sections, a few KB. Three chips,
 * deduplicated, is a payload smaller than one of the page's icons. Past the
 * edge of the tree the page falls back to asking, which still works and is
 * what it always did.
 *
 * ── What it costs ───────────────────────────────────────────────────────
 *
 * The text is published exactly as written, headings stripped. Nothing is
 * composed, trimmed, or adapted to the phrasing of the chip. That is the
 * point, and it puts one requirement on the corpus: a section has to stand
 * on its own, because it will be read on its own. See
 * data/_templates/README.md — "Before you ingest: does this section need
 * rewriting?" — for the rule, which is mostly "no".
 *
 * ── Drift ───────────────────────────────────────────────────────────────
 *
 * Nothing is baked to disk, deliberately. A generated JSON of answers would
 * be a fourth copy of the corpus to keep in step with the markdown, the .bin
 * vectors and the manifest, and it would go stale silently. Reading markdown
 * at boot means an edit is live on the next restart, which happens on every
 * deploy, and the manifest guard already refuses to boot on markdown that
 * has drifted from its vectors.
 *
 * A heading that no longer exists is logged loudly and that one entry loses
 * its precomputed answer — it falls through to the engine and still works,
 * slower. A missing section must not take the site's chat down.
 *
 * ── Nothing here is about this person or this industry ──────────────────
 *
 * This file knows about markdown, `##` headings, and a list of roots. It
 * does not know what the site is for. The same code serves a personal page,
 * a storefront answering "will this fit my setup?", or a creator answering
 * "how did you make this?" — the corpus changes and this does not, which is
 * why it is written to be lifted into the shared library as it stands.
 */

const fs   = require("fs").promises;
const path = require("path");

const CONFIG = require("../config");
const { actionsFor } = require("./actions");

/** How many chips deep the page can go before it has to ask the API. */
const DEPTH = 4;

/** Follow-ups offered under any one answer. Four is a menu, not a path. */
const MAX_FOLLOW_UPS = 3;

/**
 * Questions are matched on their text, so this is the key everything is
 * stored under. Lowercase, collapse whitespace, drop terminal punctuation —
 * generous enough to catch someone who typed the question themselves or
 * pasted it with the question mark eaten, and nothing cleverer, because a
 * near-miss should fall through to real retrieval rather than be
 * force-fitted to a canned answer.
 */
const normalise = (q) => String(q || "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .replace(/[?.!\s]+$/, "")
  .trim();

/** `## heading` → body, in document order. */
const parseSections = (markdown) => {
  const sections = [];
  let current = null;
  for (const line of markdown.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) sections.push(current = { heading: match[1], lines: [] });
    else if (current) current.lines.push(line);
  }
  return sections.map(({ heading, lines }) => ({
    heading,
    body: lines.join("\n").trim(),
  }));
};

const walk = async (dir) => {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
};

/**
 * Every section in the corpus, keyed by its normalised heading.
 *
 * Headings are unique across this corpus (201 of them, no collisions), which
 * is what lets a question be its own identifier — no ids to mint, none to
 * ship, and a follow-up on the wire is just the question it asks.
 * A collision is logged rather than silently resolved, because the second
 * one would otherwise shadow the first and nobody would ever find out.
 */
const buildGraph = async (root) => {
  const graph = new Map();

  for (const file of await walk(root)) {
    const rel = path.relative(root, file);
    const sections = parseSections(await fs.readFile(file, "utf8"));

    sections.forEach((section, index) => {
      const key = normalise(section.heading);
      if (graph.has(key)) {
        console.error(
          `corpus: duplicate heading "${section.heading}" in ${rel} — ` +
          `already defined in ${graph.get(key).file}; ignoring the second.`);
        return;
      }

      // Siblings, rotated so the section AFTER this one comes first.
      //
      // Order matters more than it looks. Taken from the top of the file
      // instead, two different answers out of the same document would both
      // offer the document's opening questions — the ones furthest from what
      // was just asked. perspective/how_i_see_myself.md holds both "How
      // would your toughest critic describe you?" and "What's the most
      // misunderstood aspect of your leadership style?", and neither should
      // lead with what keeps him awake at night.
      const siblings = [];
      for (let i = 1; i < sections.length; ++i) {
        siblings.push(sections[(index + i) % sections.length].heading);
      }

      graph.set(key, { q: section.heading, a: section.body, file: rel, siblings });
    });
  }

  return graph;
};

/** "stories/x.md#Some heading" → { file, heading }. */
const parseRef = (ref) => {
  const hash = ref.indexOf("#");
  if (hash < 0) throw new Error(`starter source needs a #heading: ${ref}`);
  return { file: ref.slice(0, hash), heading: ref.slice(hash + 1) };
};

/**
 * Walk out from a set of questions, collecting what the page will need.
 *
 * Breadth-first and deduplicated: a section reached twice is shipped once,
 * which is most of why a four-deep tree stays small — the edges inside a
 * document point back at each other, so the frontier collapses almost
 * immediately rather than branching.
 */
const expand = (graph, questions, depth) => {
  const out = {};
  let frontier = questions.map(normalise);

  for (let level = 0; level < depth && frontier.length; ++level) {
    const next = [];
    for (const key of frontier) {
      if (out[key]) continue;
      const node = graph.get(key);
      if (!node) continue;

      const followUps = node.siblings.slice(0, MAX_FOLLOW_UPS);
      out[key] = { q: node.q, a: node.a, f: followUps };
      next.push(...followUps.map(normalise));
    }
    frontier = next;
  }

  return out;
};

const build = async () => {
  const graph = await buildGraph(CONFIG.MARKDOWNS);
  const entries = [];

  for (const starter of CONFIG.STARTERS || []) {
    const refs = (starter.from || []).map(parseRef);
    const bodies = [];
    const used = new Set();
    const siblings = [];
    let broken = false;

    for (const { file, heading } of refs) {
      const node = graph.get(normalise(heading));
      if (!node || node.file !== file || !node.a) {
        console.error(
          `starters: "${heading}" not found in ${file} — ` +
          `"${starter.label}" will fall back to the engine`);
        broken = true;
        break;
      }
      bodies.push(node.a);
      used.add(normalise(heading));
      siblings.push(...node.siblings);
    }

    // No precomputed answer: the chip still works, it just asks the engine.
    if (broken || !bodies.length) {
      entries.push({ label: starter.label, q: starter.q });
      continue;
    }

    const followUpQuestions = siblings
      .filter(h => !used.has(normalise(h)))
      .filter((h, i, all) => all.indexOf(h) === i)
      .slice(0, MAX_FOLLOW_UPS);

    entries.push({
      label: starter.label,
      q: starter.q,
      a: bodies.join("\n\n"),
      followUpQuestions,
      // The headings whose text is inside this answer. A root can fold in
      // several sections, and the page has no way to know that from the
      // prose — without this it would cheerfully offer "Why did you object
      // to that?" as a follow-up to an answer that already answered it.
      covers: refs.map(r => r.heading),
      // Normally decided per request from the question. A starter's question
      // never changes, so it is decided once here instead — and for the
      // behavioural set the honest answer is almost always none.
      actions: await actionsFor(starter.q),
    });
  }

  // A root that consumed every section in its document has no sibling left
  // to offer. Rather than end on a wall with no doors, borrow the other
  // roots' questions — the same thing /query does when the model comes back
  // with no follow-ups. These carry no answer in the tree, so pressing one
  // asks the API, which short-circuits it for free anyway.
  for (const entry of entries) {
    if (!entry.a || entry.followUpQuestions.length) continue;
    entry.followUpQuestions = entries
      .filter(other => other !== entry)
      .map(other => other.q)
      .slice(0, MAX_FOLLOW_UPS);
  }

  const byQuestion = new Map(
    entries.filter(e => e.a).map(e => [normalise(e.q), e]));

  const ready = entries.filter(e => e.a).length;
  console.log(
    `Starters ready — ${ready}/${entries.length} answered from the corpus, ` +
    `${graph.size} sections indexed, ${DEPTH} levels deep.`);

  return {
    /** All of them, precomputed answer included where there is one. */
    all: () => entries,

    /**
     * The precomputed answer for a question, or null.
     *
     * Deliberately only the roots, not every section in the graph. A chip
     * sends its question with full context behind it, so the page can serve
     * any node of the tree itself. A question arriving at /query has no such
     * context — "Did you fix it?" typed in the middle of an unrelated
     * conversation must go to retrieval, not to whichever document happens
     * to contain that heading.
     */
    answerFor: (question) => byQuestion.get(normalise(question)) || null,

    /**
     * `n` roots and the subgraph under them: everything the page needs to
     * answer DEPTH levels of follow-ups without asking for anything.
     *
     * Sampled without replacement so one response never shows the same
     * question twice. Partial Fisher-Yates over a copy — the pool is small
     * and this runs once per greeting, so clarity beats cleverness.
     */
    pick: (n) => {
      const pool = [...entries];
      const count = Math.min(n, pool.length);
      for (let i = 0; i < count; ++i) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const roots = pool.slice(0, count);

      // DEPTH counts chips below the answer, and the roots' own follow-ups
      // are the first of those, so the walk starts from them.
      const seeds = roots.flatMap(r => r.followUpQuestions || []);
      const sections = expand(graph, seeds, DEPTH);

      // Every root, not just the three on screen.
      //
      // Follow-up edges stay inside one document, so a thread through a
      // three-section file runs out after a click or two and falls back to
      // `more` below. Without this that fallback is the one click in the
      // whole tree that costs a request. With it, the entire behavioural
      // set is in hand and a visitor can read for as long as they like
      // without the page asking for anything again. It costs about 10KB of
      // text, which gzips to less than one of the icons.
      for (const root of entries) {
        if (!root.a) continue;
        const key = normalise(root.q);
        if (!sections[key]) {
          sections[key] = { q: root.q, a: root.a, f: root.followUpQuestions || [] };
        }
      }

      return {
        starters: roots,
        sections,
        // Last resort for a thread that runs out of document. Follow-up
        // edges stay inside one file, so a two-section file exhausts after
        // two clicks — and an answer with no chips under it is a dead end
        // on a page whose whole job is to keep offering the next question.
        // These carry no answer, so pressing one asks the API, which
        // short-circuits a starter for free anyway.
        more: entries.map(e => e.q),
      };
    },
  };
};

module.exports = { build, buildGraph, expand, parseSections, normalise, DEPTH };
