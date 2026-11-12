"use strict"

// --------------------------------------------------------------------------
// Fast read
//
// Bionic reading: the first few letters of every word carry the weight, and
// the eye is supposed to fix on them and let the rest fill itself in.
//
// Whether it works is genuinely contested — the published evidence is thin
// and the strongest claims come from the people selling it. It is in here as
// an option rather than a default for exactly that reason: some people find
// it helps a great deal, nobody is obliged to use it, and the page remembers
// which camp you are in.
//
// The transform is DOM-level rather than CSS, because there is no selector
// for "the first 40% of each word". So it rewrites text nodes into a
// <b class="bionic"> and a remainder, and can take them apart again.
// --------------------------------------------------------------------------

/** Where the page remembers the setting. */
export const FAST_READ_KEY = "fast-read";

/**
 * A word, for this purpose.
 *
 * Letters and digits in any script, plus the apostrophes and hyphens that
 * live INSIDE words — so "doesn't" and "state-of-the-art" are each one word
 * and keep their bold prefix at the front rather than acquiring one per
 * fragment. \p{L} rather than [a-z] because the corpus has French in it.
 */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/**
 * How much of a word to embolden.
 *
 * The common implementations all land near the same shape: everything of a
 * one-to-three letter word, then about 40% rounded up. Short words carry
 * more proportionally because a single bold letter on "the" is not a fixation
 * point, it is a typo.
 */
const leadLength = (word) => (word.length <= 3 ? word.length : Math.ceil(word.length * 0.4));

/** Already transformed, or inside something that should be left alone. */
const skip = (node) => {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (el.classList && el.classList.contains("bionic")) return true;
    const tag = el.tagName;
    // Code keeps its own emphasis, and a <b> inside a heading would fight
    // the weight the heading already has.
    if (tag === "CODE" || tag === "PRE" || tag === "KBD" || tag === "SAMP") return true;
  }
  return false;
};

/**
 * Bold the opening of every word under `root`, in place.
 *
 * Collects the text nodes BEFORE touching any of them: replacing a node
 * while a TreeWalker is standing on it is how you end up walking the
 * replacements and bolding the bold.
 */
export const fastRead = (root) => {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.data.trim() && !skip(n)) texts.push(n);
  }

  for (const node of texts) {
    const text = node.data;
    const out = document.createDocumentFragment();
    let at = 0;

    for (const match of text.matchAll(WORD)) {
      const word = match[0];
      const cut = leadLength(word);
      if (match.index > at) out.appendChild(document.createTextNode(text.slice(at, match.index)));

      const bold = document.createElement("b");
      bold.className = "bionic";
      bold.textContent = word.slice(0, cut);
      out.appendChild(bold);

      if (cut < word.length) out.appendChild(document.createTextNode(word.slice(cut)));
      at = match.index + word.length;
    }

    // No words in it — punctuation, an emoji, a lone dash. Leave it alone
    // rather than replacing a node with an identical one.
    if (!out.childNodes.length) continue;
    if (at < text.length) out.appendChild(document.createTextNode(text.slice(at)));
    node.parentNode.replaceChild(out, node);
  }
};

/**
 * Put it back.
 *
 * normalize() at the end is what stops the text fracturing a little more
 * every time the toggle is pressed: without it, three presses leave a word
 * spread across six adjacent text nodes, and the typing animation and the
 * copy button both read that as the same string with different seams.
 */
export const plainRead = (root) => {
  if (!root) return;
  for (const bold of [...root.querySelectorAll("b.bionic")]) {
    bold.replaceWith(document.createTextNode(bold.textContent));
  }
  root.normalize();
};

/** What the page remembers. Storage can throw in a private window. */
export const fastReadOn = () => {
  try { return localStorage.getItem(FAST_READ_KEY) === "on"; } catch { return false; }
};

export const rememberFastRead = (on) => {
  try { localStorage.setItem(FAST_READ_KEY, on ? "on" : "off"); } catch { /* nothing to do */ }
};
