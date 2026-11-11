"use strict";

/**
 * Turn "can I see your CV?" into a button that downloads it.
 *
 * An answer used to be able only to describe where a button is — "open the
 * menu at the bottom left and choose Download my resume" — which is a page
 * telling someone where to look instead of handing them the thing. (That
 * menu is gone now; the links live in the icon row. The point stands: a
 * button under the answer beats a direction to one.)
 *
 * ── Why the model does not decide this ──────────────────────────────────
 *
 * The obvious design is to let the answering model emit the keys. Two
 * reasons not to:
 *
 *   1. It cannot. llms' query action returns an explicit object — answer,
 *      followUpQuestions, and nothing else — so an `actions` field in the
 *      model's JSON is discarded inside the library before this server sees
 *      it. Changing that means a library release for four buttons.
 *
 *   2. It should not. This is a fixed four-way classification over the
 *      question, which an embedding answers for nothing: the model is
 *      already resident, the comparison is a dot product, and the result is
 *      deterministic and testable. Letting an LLM choose would add a thing
 *      that can be talked into choosing wrongly, for no gain over matching
 *      the question against a handful of phrasings.
 *
 * The anchors are embedded once at boot. Per request this costs one
 * vectorize call on the query — roughly 20ms — and no money.
 */

const vectorize = require("llms/src/xenova/vectorize");

/**
 * Phrasings for each destination. The whole question is matched against
 * these, so they are written as questions rather than keywords: "resume"
 * alone also sits inside "what's on your resume for 2019", which is a
 * question about his history, not a request for the file.
 */
const ANCHORS = Object.freeze({
  resume: [
    "Can I see your resume?",
    "Can I download your CV?",
    "Where can I find your resume?",
    "Do you have a CV I can look at?",
  ],
  linkedin: [
    "What's your LinkedIn?",
    "Where can I find your profile?",
    "Do you have a LinkedIn page?",
  ],
  book: [
    "Can we set up a call?",
    "How do I book time with you?",
    "Can I schedule a meeting with you?",
    "Are you free to talk?",
    "How can I get in touch with you?",
  ],
  share: [
    "Can I share this page?",
    "How do I send this to someone?",
  ],
  // The book answers are written as teasers — they say what the chapter
  // argues and leave the evidence in it — so the one thing they must always
  // offer is a way to go and read it. A link inside the prose does not
  // survive: the answering model composes from the section and drops the
  // trailing sentence often enough that an upsell resting on it is not an
  // upsell. A button does not depend on the model saying anything.
  thebook: [
    "Where can I buy your book?",
    "How do I get a copy of The AI Transformation?",
    "Is your book on Amazon?",
    "Have you written a book?",
    "What's your chapter about?",
    "Tell me about your book.",
  ],
});

/**
 * How close the question has to sit to one of those phrasings.
 *
 * Measured, not picked — server/scripts/measure-actions.js prints the table.
 * The cost of the two errors is lopsided: a missing button leaves the page
 * exactly as it was before this file (the answer still says where the icons
 * are), while a button nobody asked for is clutter on an answer they did ask
 * for, and on a page whose whole point is restraint. So this sits above the
 * highest scoring near-miss rather than below the lowest true match.
 */
const SIMILAR = 0.78;

/** At most two. Three buttons under an answer is a toolbar. */
const MAX_ACTIONS = 2;

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; ++i) s += a[i] * b[i];
  return s;
};

let anchorsPromise = null;

/** Embed every anchor once. Idempotent; the first call does the work. */
const warm = () => anchorsPromise || (anchorsPromise = (async () => {
  const entries = [];
  for (const [key, phrases] of Object.entries(ANCHORS)) {
    for (const phrase of phrases) {
      entries.push({ key, phrase, vector: await vectorize(phrase) });
    }
  }
  return entries;
})());

/**
 * @param {string} query
 * @returns {Promise<string[]>} destination keys, best first, at most two
 *
 * Never throws. A failure here must not cost the visitor their answer, which
 * has already been paid for — on any error the result is no buttons, which
 * is the page as it was.
 */
const actionsFor = async (query) => {
  if (typeof query !== "string" || !query.trim()) return [];
  try {
    const [anchors, q] = await Promise.all([warm(), vectorize(query)]);

    // Best score per destination, so a key with more phrasings than another
    // is not thereby more likely to win.
    const best = new Map();
    for (const { key, vector } of anchors) {
      const score = dot(q, vector);
      if (score > (best.get(key) ?? -1)) best.set(key, score);
    }

    return [...best.entries()]
      .filter(([, score]) => score >= SIMILAR)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ACTIONS)
      .map(([key]) => key);
  } catch (err) {
    console.error("actionsFor:", err.message);
    return [];
  }
};

/** Scores for every destination, for the measurement script. */
const scoresFor = async (query) => {
  const [anchors, q] = await Promise.all([warm(), vectorize(query)]);
  const best = new Map();
  for (const { key, vector } of anchors) {
    const score = dot(q, vector);
    if (score > (best.get(key) ?? -1)) best.set(key, score);
  }
  return Object.fromEntries(best);
};

module.exports = { actionsFor, scoresFor, warm, ANCHORS, SIMILAR, MAX_ACTIONS };
