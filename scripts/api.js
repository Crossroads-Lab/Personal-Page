"use strict"

// --------------------------------------------------------------------------
// Backend client
//
// The site is static on GitHub Pages; only this one endpoint is dynamic.
// Keeping them separate means a dead backend degrades to "the chat box is
// broken" rather than "the site is down".
// --------------------------------------------------------------------------

const LOCAL_HOSTS = ["localhost", "127.0.0.1", ""];

export const API_BASE = LOCAL_HOSTS.includes(location.hostname)
  ? "http://localhost:3002"
  : "https://api.william-brendel.com";

// A Claude call runs 1-3s. Past ~25s something is wrong and the visitor
// deserves an answer rather than an indefinite spinner.
const TIMEOUT_MS = 25000;

const FAILURE_TEXT =
  "I can't reach my brain right now — that's on me, not you. " +
  "Try again in a moment, or book time with me using the calendar icon on this page.";

/** A chunk that ends a sentence is a paragraph; one that does not is a clause. */
const FINISHED = /[.!?:\u2026]["'\u201d\u2019)\]]*$/;

/**
 * Join answer chunks into the answer.
 *
 * A chunk is one passage the backend grounded on its own — nearly always a
 * paragraph of the source, and written to be read as one. Gluing them with
 * a space, as this did until now, turned a four-paragraph story into a
 * single block of three hundred words. Nobody reads that; a recruiter with
 * eleven tabs open certainly does not.
 *
 * So the join is a blank line, which scripts/markdown.js renders as
 * separate paragraphs — but only where the previous chunk actually finished
 * its sentence. The model's chunking is not a promise, and a break dropped
 * mid-clause is worse than no break at all. Everything else joins with a
 * space, which is also what stops "next hire.Another one:".
 */
export const joinChunks = (chunks) => (chunks || [])
  .map(c => (c && typeof c.text === "string") ? c.text : "")
  .filter(c => c.trim())
  .reduce((acc, next) => {
    if (!acc) return next.trim();
    const left = acc.replace(/\s+$/, "");
    const right = next.replace(/^\s+/, "");
    return FINISHED.test(left) ? `${left}\n\n${right}` : `${left} ${right}`;
  }, "")
  .trim();

/**
 * Ask the backend a question.
 *
 * Always resolves — never rejects. Every failure mode is turned into
 * something sayable, because a visitor should never see a stack trace or a
 * spinner that runs forever.
 *
 * @param {string} query
 * @param {AbortSignal} [external] - from the stop button.
 * @param {boolean} [fromChip] - true when the visitor pressed a question
 *   the page offered rather than typing one. Every chip comes from the
 *   corpus, so the backend answers it with the section it is the heading of
 *   — as written, for nothing. A heading is not always a self-contained
 *   question ("Which one matters most to you, and why that one?"), so this
 *   has to be the page saying how the question arrived, not the backend
 *   guessing from the text.
 * @param {{q: string, a: string}[]} [history] - the tail of this visit's
 *   conversation. There is no session on the backend, so the page carries it:
 *   it resolves follow-ups ("what about at Samsung?") and lets the backend
 *   drop follow-up suggestions that only reword something already asked.
 * @returns {Promise<{text: string, followUps: string[], actions: string[], ok: boolean}>}
 */
export const ask = async (query, external, history = [], fromChip = false) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Let the stop button cancel an in-flight request. Without this the fetch
  // keeps running after the user gives up and the answer lands on a cleared
  // screen.
  const relay = () => controller.abort();
  external?.addEventListener("abort", relay);

  try {
    const response = await fetch(`${API_BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, history, chip: fromChip }),
      signal: controller.signal,
    });

    // 429 and 503 are rate limits. The server already returns its message in
    // the normal answer shape, so render it like any other reply rather than
    // treating it as an error.
    if (response.status === 429 || response.status === 503) {
      const body = await response.json().catch(() => null);
      return {
        text: joinChunks(body?.answer) || FAILURE_TEXT,
        followUps: [],
        actions: [],
        ok: true,
      };
    }

    if (!response.ok) {
      return { text: FAILURE_TEXT, followUps: [], actions: [], ok: false };
    }

    const body = await response.json();
    const text = joinChunks(body.answer);

    return {
      text: text || FAILURE_TEXT,
      followUps: Array.isArray(body.followUpQuestions) ? body.followUpQuestions : [],
      // Keys, not URLs. The backend has already dropped anything that is not
      // one of the four it knows; the page maps them to the menu entries.
      actions: Array.isArray(body.actions) ? body.actions : [],
      ok: Boolean(text),
    };

  } catch (error) {
    // Aborted by the stop button — the caller already cleared the screen and
    // has nothing to render.
    if (external?.aborted) return { text: "", followUps: [], actions: [], ok: true, aborted: true };

    // Timeout or network failure.
    return { text: FAILURE_TEXT, followUps: [], actions: [], ok: false };

  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", relay);
  }
};
