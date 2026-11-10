"use strict";

/**
 * Drop follow-up suggestions the visitor has already asked.
 *
 * The model writes follow-ups from the answer it just produced, with no
 * memory of the conversation — so after "How did you get into AI?" it will
 * happily offer "How did you end up in AI in the first place?". Same
 * question, new words, and the visitor has to notice that for themselves.
 *
 * String comparison does not catch it; those two sentences share almost no
 * words. Embeddings do, and the embedding model is already resident and
 * local, so this costs one extra forward pass and no money.
 *
 * Measured on bge-small-en-v1.5 (server/scripts/measure-asked.js) over pairs
 * of real starters and plausible rewordings:
 *
 *   same question, different words   0.747 … 0.915
 *   genuinely different questions    0.444 … 0.772
 *
 * The two overlap, so no threshold is clean and the choice is which error to
 * make. Suppressing a good follow-up costs the visitor a question they never
 * knew to ask; repeating one costs them a click and makes the page look like
 * it was not listening. The first is worse, so SIMILAR sits above the
 * highest genuinely-different pair rather than below the lowest duplicate —
 * "What was your first AI project?" (0.772 against "How did you get into
 * AI?") survives, and the near-duplicate at 0.747 slips through.
 */

const vectorize = require("llms/src/xenova/vectorize");

const SIMILAR = 0.82;

/**
 * How many past questions to weigh. Each one is its own forward pass —
 * vectorize() takes a single string; handed an array it returns the vectors
 * concatenated into one flat array, which is not a shape worth relying on.
 * Eight is far more history than a visitor on a personal page builds up, and
 * it bounds the added latency at roughly a tenth of a second.
 */
const WINDOW = 8;

const MAX_CHARS = 300;

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; ++i) s += a[i] * b[i];
  return s;
};

/** Trim a client-supplied list to something safe to embed. */
const clean = (asked) => (Array.isArray(asked) ? asked : [])
  .filter(q => typeof q === "string" && q.trim())
  .map(q => q.trim().slice(0, MAX_CHARS))
  .slice(-WINDOW);

const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * @param {string[]} suggestions  follow-ups as the model wrote them
 * @param {string[]} asked        questions already put to the page
 * @returns {Promise<string[]>}   suggestions worth showing, order preserved
 *
 * Never throws: a failure here must not cost the visitor their answer, which
 * has already been paid for. On any error the suggestions pass through
 * untouched — the page is then exactly as good as it was before this file.
 */
const filterAsked = async (suggestions, asked) => {
  const list = (suggestions || []).filter(s => typeof s === "string" && s.trim());
  const past = clean(asked);
  if (!list.length || !past.length) return list;

  // Exact repeats first — free, and it means the embedding pass only has to
  // judge the interesting cases.
  const seen = new Set(past.map(key));
  const candidates = list.filter(s => !seen.has(key(s)));
  if (!candidates.length) return [];

  try {
    // Vectors come back L2-normalised, so the dot product IS the cosine.
    const [suggested, history] = await Promise.all([
      Promise.all(candidates.map(q => vectorize(q))),
      Promise.all(past.map(q => vectorize(q))),
    ]);

    return candidates.filter((_, i) =>
      !history.some(h => dot(suggested[i], h) >= SIMILAR));
  } catch (err) {
    console.error("filterAsked:", err.message);
    return candidates;
  }
};

module.exports = { filterAsked, SIMILAR, WINDOW };
