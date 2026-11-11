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
const deriveDocumentId = require("llms/src/utilities/deriveDocumentId");
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
/** Headings whose section is answerable but never advertised. */
const SILENT = new Set((CONFIG.NEVER_SUGGEST || []).map(h => String(h)
  .toLowerCase().replace(/\s+/g, " ").replace(/[?.!\s]+$/, "").trim()));

const normalise = (q) => String(q || "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .replace(/[?.!\s]+$/, "")
  .trim();

/**
 * The first question in a string that may hold several.
 *
 * Headings here are often written as two phrasings of one thing — "Where
 * can I find your resume? Can I download your CV?" — and the same section's
 * generated questions include the short form on its own. Keyed by the whole
 * string those are two different chips, and the page offered both at once:
 *
 *     · Where can I find your resume?
 *     · Where can I find your resume? Can I download your CV?
 *
 * which is one suggestion wearing two coats and a wasted slot out of three.
 */
const topicOf = (q) => {
  const text = normalise(q);
  const first = text.split(/\?\s*/)[0];
  return (first || text).trim();
};

/**
 * Words that carry no subject, so two questions sharing only these share
 * nothing. Everything a visitor's question is actually ABOUT survives.
 */
const EMPTY_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "for", "with", "about", "from", "by", "as", "is", "are", "was", "were",
  "be", "been", "do", "did", "does", "can", "could", "would", "should",
  "will", "have", "has", "had", "you", "your", "yours", "i", "me", "my",
  "we", "us", "our", "it", "its", "that", "this", "there", "what", "whats",
  "when", "where", "which", "who", "whom", "why", "how", "any", "some",
  "tell", "say", "give", "like", "want", "need", "get", "got", "much",
  "many", "ever", "also", "than", "then", "too", "very", "please",
]);

/** The words a question is about, deduplicated. */
const contentWords = (q) => new Set(
  normalise(q).replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length >= 3 && !EMPTY_WORDS.has(w)),
);

/**
 * Is this question already covered by one that has been taken?
 *
 * Three tests, each catching a shape the one before it misses.
 *
 * 1. The same topic outright.
 *
 * 2. One topic a leading phrase of the other — "where can i find your
 *    resume" against "where can i find your resume? can i download your
 *    cv?". Corpus headings are often written as two phrasings of one thing,
 *    and the same section's generated questions carry the short form alone,
 *    so the page offered both at once.
 *
 * 3. One question's subject words contained in the other's, or two thirds
 *    shared. "How do I book a call with you?" and "How do I book time with
 *    you? Can we set up a call?" have no common prefix at all and are
 *    plainly the same chip; {book, call} inside {book, time, set, call}
 *    says so. The subset test needs two words on the smaller side, because
 *    one word in common is a topic, not a duplicate — {book} would
 *    otherwise collapse "Have you written a book?" into "What's your book
 *    about?", which are different questions.
 */
const tooClose = (question, topics) => {
  const topic = topicOf(question);
  if (!topic) return false;
  const words = contentWords(question);

  for (const taken of topics) {
    if (taken === topic) return true;

    const [longer, shorter] = taken.length >= topic.length ? [taken, topic] : [topic, taken];
    if (shorter.length >= 12 && longer.startsWith(`${shorter} `)) return true;

    const other = contentWords(taken);
    if (!other.size || !words.size) continue;

    const shared = [...words].filter(w => other.has(w)).length;
    const [big, small] = words.size >= other.size ? [words, other] : [other, words];
    if (small.size >= 2 && shared === small.size) return true;
    if (shared / (big.size + small.size - shared) >= 0.6) return true;
  }
  return false;
};

/**
 * `## heading` → body, in document order, with the offset each section
 * starts at.
 *
 * Offsets are STRING indices, matching what a .bin stores. This is easy to
 * get backwards — llms' own extractSections calls them a "byte range" in
 * two comments — but both it and SectionResolver do `markdown.slice(start,
 * end)` on a JS string, so a range is in UTF-16 code units, not bytes.
 *
 * It was written here with Buffer.byteLength first, and the difference is
 * not academic: this corpus is full of em dashes, three bytes and one
 * character each, so the two offsets drift apart as a file goes on. Four
 * characters by the middle of a short story, more in a long one — enough
 * to attribute a citation near a section boundary to the section next
 * door, silently, which is the only kind of wrong that matters here.
 */
const parseSections = (markdown) => {
  const sections = [];
  let current = null;
  let offset = 0;

  for (const line of markdown.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) sections.push(current = { heading: match[1], lines: [], start: offset });
    else if (current) current.lines.push(line);
    offset += line.length + 1;                        // + the newline
  }

  return sections.map(({ heading, lines, start }, i) => ({
    heading,
    body: lines.join("\n").trim(),
    start,
    // Up to the next heading, or the end of the file.
    end: i + 1 < sections.length ? sections[i + 1].start : Infinity,
  }));
};

const walk = async (dir, suffix = ".md") => {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) out.push(full);
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
/**
 * The questions each section can be asked, written at ingest.
 *
 * `<stem>.questions.json` beside each `<stem>.bin` — see scripts/ingest.js
 * and llms' `onRows`. These are the phrasings augmentation generated so
 * retrieval could find a section from words it does not itself use, kept
 * instead of embedded and dropped.
 *
 * Missing files are not an error. A corpus ingested before this existed has
 * none, and the follow-up path falls back to document adjacency, which is
 * what it did before. Nothing here may make the site refuse to boot.
 */
const loadQuestions = async (datasetRoot) => {
  const byDocument = new Map();
  let files = [];
  try { files = await walk(datasetRoot, ".questions.json"); } catch { return byDocument; }

  for (const file of files) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      if (parsed && parsed.documentId && Array.isArray(parsed.sections)) {
        byDocument.set(parsed.documentId, parsed.sections);
      }
    } catch (err) {
      console.error(`starters: ${path.basename(file)} unreadable — ${err.message}`);
    }
  }
  return byDocument;
};

const buildGraph = async (root, datasetRoot = CONFIG.DATASET) => {
  const graph = new Map();
  const documents = new Map();     // documentId → sections, in order
  const asked = await loadQuestions(datasetRoot);

  for (const file of await walk(root)) {
    const rel = path.relative(root, file);
    const sections = parseSections(await fs.readFile(file, "utf8"));
    const documentId = deriveDocumentId(file);

    // Attach what each section can be asked. The sidecar keys sections by
    // the range the .bin indexes by — the body span — which sits inside the
    // span measured here from the heading, so a start inside a section's
    // bounds identifies it.
    for (const entry of asked.get(documentId) || []) {
      const start = Array.isArray(entry.range) ? entry.range[0] : null;
      if (start === null) continue;
      const section = sections.find(s => start >= s.start && start < s.end);
      if (section) section.asked = entry.questions || [];
    }

    documents.set(documentId, { file: rel, sections });

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

  return { graph, documents, asked };
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

      const followUps = node.siblings
        .filter(h => !SILENT.has(normalise(h)))
        .slice(0, MAX_FOLLOW_UPS);
      out[key] = { q: node.q, a: node.a, f: followUps };
      next.push(...followUps.map(normalise));
    }
    frontier = next;
  }

  return out;
};


/**
 * Follow-ups for an answer the engine produced, taken from the corpus.
 *
 * ── Why the model does not write these ──────────────────────────────────
 *
 * It used to, and a follow-up chip is a promise: the page offered the
 * question, so there had better be an answer behind it. A model writing
 * follow-ups from the answer it just produced has no idea what else is in
 * the corpus, so it writes plausible next questions — and a plausible
 * question about a corpus that does not cover it is a chip that leads
 * straight to "I haven't written that up". The page talked someone into
 * asking something it could not answer, which is worse than offering
 * nothing.
 *
 * Observed live: an answer about raising problems early offered "How do you
 * handle an engineer's work you think is headed the wrong way?" Nothing in
 * the corpus answers it. The chip was the bug, not the answer.
 *
 * ── Where these come from instead ───────────────────────────────────────
 *
 * The answer cites its sources — documentId plus a byte range — so we know
 * which documents it was actually built from, and which sections of them.
 * The follow-ups are drawn from the OTHER sections of those documents —
 * and from each one, the questions augmentation generated for it rather
 * than its heading. Those questions exist so retrieval can reach a section
 * from words the section itself does not use, which is exactly what makes
 * them the phrasings a reader turns up with. Every one has an answer by
 * construction: it was written to point at a section that exists.
 *
 * A heading is the author's filing label ("Which one matters most to you,
 * and why that one?") and often does not stand up away from the document.
 * These do. Where a section has none — an older ingest, or augmentation
 * that produced nothing — the heading is still the fallback.
 *
 * Free, deterministic, and it cannot promise something that is not there.
 *
 * @param {{documentId?: string, range?: number[]}[]} sources
 * @param {string[]} asked - everything this visit has already been through
 * @returns {string[]} questions, at most MAX_FOLLOW_UPS
 */
const followUpsFrom = (documents, sources, alreadyAsked) => {
  const seen = new Set((alreadyAsked || []).map(normalise));
  // Exact keys are not enough: see topicOf above.
  const topics = new Set((alreadyAsked || []).map(topicOf).filter(Boolean));

  // Documents this answer actually drew on, most-quoted first, and which of
  // their sections it used.
  const weight = new Map();
  const citedAt = new Map();          // documentId → Set of section indexes

  for (const source of sources || []) {
    const id = source?.documentId;
    const doc = id && documents.get(id);
    if (!doc) continue;

    weight.set(id, (weight.get(id) || 0) + 1);
    if (!citedAt.has(id)) citedAt.set(id, new Set());

    const start = Array.isArray(source.range) ? source.range[0] : null;
    if (start === null) continue;
    const index = doc.sections.findIndex(s => start >= s.start && start < s.end);
    if (index >= 0) citedAt.get(id).add(index);
  }

  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const out = [];

  // ── First choice: the questions those sections were written to answer ──
  //
  // Augmentation generated them so retrieval could reach a section from
  // words the section does not use — which makes them the phrasings a
  // reader actually arrives with, and makes every one of them a question
  // this corpus answers by construction. Offering a heading instead means
  // offering the author's filing label; offering these means offering the
  // reader's own words. Both are safe; only one sounds like a person.
  //
  // One per section, so three chips are three different places to go rather
  // than three angles on the same one.
  for (const id of ranked) {
    const { sections } = documents.get(id);
    const cited = citedAt.get(id) || new Set();
    const from = cited.size ? Math.max(...cited) : -1;

    for (let i = 1; i <= sections.length; ++i) {
      const index = (from + i + sections.length) % sections.length;
      if (cited.has(index)) continue;
      if (SILENT.has(normalise(sections[index].heading))) continue;
      const question = (sections[index].asked || [])
        .find(q => !seen.has(normalise(q)) && !tooClose(q, topics));
      if (!question) continue;
      seen.add(normalise(question));
      topics.add(topicOf(question));
      out.push(question);
      break;                                 // one per section
    }
    if (out.length >= MAX_FOLLOW_UPS) return out;
  }

  // ── Fallback: the sections' own headings ───────────────────────────────
  //
  // For a corpus ingested before the questions were persisted, and for a
  // section whose augmentation produced none. The headings are written as
  // questions here, so this degrades to the previous behaviour rather than
  // to nothing.
  for (const id of ranked) {
    const { sections } = documents.get(id);
    const cited = citedAt.get(id) || new Set();
    const from = cited.size ? Math.max(...cited) : -1;

    for (let i = 1; i <= sections.length; ++i) {
      const index = (from + i + sections.length) % sections.length;
      if (cited.has(index)) continue;
      const key = normalise(sections[index].heading);
      if (seen.has(key) || SILENT.has(key)) continue;
      if (tooClose(sections[index].heading, topics)) continue;
      seen.add(key);
      topics.add(topicOf(sections[index].heading));
      out.push(sections[index].heading);
      if (out.length >= MAX_FOLLOW_UPS) return out;
    }
  }

  return out;
};

const build = async () => {
  const { graph, documents, asked } = await buildGraph(CONFIG.MARKDOWNS);

  // Every persisted question, pointing at the section it was written for.
  //
  // A chip now carries a reader's phrasing rather than the author's
  // heading, so pressing one has to resolve by that phrasing. The section
  // it points at is the one augmentation generated it from, which is the
  // definition of the right answer for it.
  const byAsked = new Map();
  for (const { sections } of documents.values()) {
    for (const section of sections) {
      for (const question of section.asked || []) {
        const key = normalise(question);
        if (!byAsked.has(key)) byAsked.set(key, graph.get(normalise(section.heading)));
      }
    }
  }
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
      .filter(h => !used.has(normalise(h)) && !SILENT.has(normalise(h)))
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
  console.log(asked.size
    ? `Follow-ups from ${byAsked.size} persisted questions across ${asked.size} documents.`
    : "Follow-ups from section headings — no persisted questions found (run npm run ingest).");

  return {
    /**
     * The section a question is the heading of, served as written.
     *
     * Only for a question the page offered as a chip. Every chip now comes
     * from the corpus, so a chip click is a visitor pressing a question we
     * wrote — and the right answer is the section under it, not whatever
     * retrieval makes of the words.
     *
     * That distinction matters because plenty of headings are not
     * self-contained. "Which one matters most to you, and why that one?"
     * means something only after the section listing the values; asked cold,
     * retrieval cannot resolve "which one" and the answer is "I'm not sure
     * which one you mean" — a duck, from a chip the page itself offered.
     * Pressing it is unambiguous in a way typing it is not, so the two
     * routes are deliberately different.
     */
    sectionFor: (question) => {
      const key = normalise(question);
      const node = graph.get(key) || byAsked.get(key);
      return node && node.a ? node : null;
    },

    /**
     * Follow-ups for an engine-produced answer, from the documents it
     * cited. Empty when the answer cited nothing — a greeting, an
     * off-topic decline, or a question the corpus does not cover — and the
     * caller falls back to the openers, which are answerable by definition.
     */
    followUpsFor: (sources, asked) => followUpsFrom(documents, sources, asked),

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

module.exports = { build, buildGraph, expand, followUpsFrom, parseSections, normalise, DEPTH };
