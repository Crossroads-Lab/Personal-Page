"use strict"

import { mdToHtml } from "./md-to-html.js?v=f8a21306";

// --------------------------------------------------------------------------
// An answer's words, formatted.
//
// The model writes Markdown whether or not anyone asked it to — a book
// title in *italics*, a list of awards, the Amazon link at the end of a
// book answer. Typed straight into a text node, as this page did until
// now, that reaches the reader as literal asterisks and a URL they cannot
// click. The link is the one in the answer that was actually trying to sell
// something.
//
// Same parser as Ask Nereus (scripts/md-to-html.js, vendored), so an answer
// reads the same on both sites. Nothing it returns is trusted: every tag is
// rebuilt here from an allowlist with no attributes, except a link's
// address, and only when that address is http(s). The answer text comes
// from a language model reading a corpus, so "it can never add markup,
// attributes, styles or scripts to the page" has to be a property of this
// file rather than a hope about the model.
// --------------------------------------------------------------------------

/** Longer than any answer the backend will compose. The rest is cut, never parsed. */
const MAX_CHARS = 20000;

const LIST    = /^\s*([-*+]|\d+[.)])\s+/;
const TABLE   = /^\s*\|/;
const QUOTE   = /^\s*>/;
const FENCE   = /^\s*(```|~~~)/;
const HEADING = /^\s*#{1,6}\s/;
const RULE    = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** A line that is a paragraph's, not a block of its own. */
const plain = l => l.trim() && !LIST.test(l) && !TABLE.test(l) && !QUOTE.test(l)
  && !FENCE.test(l) && !HEADING.test(l) && !RULE.test(l);

/** A list item's own continuation line. */
const indented = l => /^\s{2,}\S/.test(l);

/**
 * The answer made ready for the parser.
 *
 *   - "$" is a dollar sign. The parser reads "$75 million and $6" as maths
 *     and hands it to katex, which this page does not load.
 *   - One line break between two lines of prose stays a line break.
 *   - A line of prose straight after a list or a table starts its own
 *     paragraph; the parser would otherwise drop it.
 */
export const prepare = (text) => {
  const lines = String(text == null ? "" : text)
    .slice(0, MAX_CHARS).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let fence = false, block = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (FENCE.test(line)) { fence = !fence; block = false; out.push(line); continue; }
    if (fence) { out.push(line); continue; }

    // Twice: "$$" is two dollar signs and the first pass consumes the gap.
    line = line.replace(/(^|[^\\])\$/g, "$1\\$").replace(/(^|[^\\])\$/g, "$1\\$");

    if (!line.trim()) block = false;
    else if (LIST.test(line) || TABLE.test(line) || QUOTE.test(line)) block = true;
    else if (!(block && indented(line))) block = false;
    out.push(line);

    const next = lines[i + 1];
    if (next == null || !plain(next)) continue;
    if (block) { if (!indented(next)) { out.push(""); block = false; } }
    else if (plain(line)) out[out.length - 1] = `${line.replace(/\s+$/, "")}  `;
  }
  return out.join("\n");
};

// --------------------------------------------------------------------------
// Sanitizer: the parser's HTML, every tag rebuilt from an allowlist.
// --------------------------------------------------------------------------

const BLOCK  = new Set(["p", "ul", "ol", "li", "blockquote", "pre", "table", "thead", "tbody", "tr", "th", "td"]);
const INLINE = new Set(["strong", "em", "del", "code", "br", "hr"]);
const EMPTY  = new Set(["br", "hr"]);
/** Kept for their words only — the tag goes. */
const UNWRAP = new Set(["span", "div", "abbr", "sup", "sub", "section", "label", "b", "i", "s", "u", "small"]);
const HEADING_TAG = /^h[1-6]$/;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n" };

/** An attribute's value as the browser would read it, so "&#106;avascript:" is caught. */
const decode = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
  if (e[0] === "#") {
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
  }
  return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
});

/**
 * A link's address when it is safe to follow, else null.
 *
 * http(s) only. No mailto: this site publishes no address in plaintext —
 * the contact row does that — and a model that invents one should not be
 * able to make it clickable.
 */
export const safeHref = (raw) => {
  // eslint-disable-next-line no-control-regex
  const url = decode(raw).replace(/[\u0000-\u001f\s\u007f-\u009f]+/g, "");
  return /^https?:\/\/[^/\s]/i.test(url) ? url : null;
};

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Text between tags: a stray "<" or "&" is shown, entities the parser wrote are kept. */
const asText = s => s
  .replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z]+);)/gi, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The parser's HTML with every tag rebuilt from the allowlist. */
export const sanitize = (html) => {
  const out = [];
  const links = [];           // for each <a> opened: was it kept?

  for (const m of String(html || "").matchAll(/<\/?[a-zA-Z][^<>]*>|[^<]+|</g)) {
    const tok = m[0];
    const tag = tok.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)\/?>$/);
    if (!tag) { out.push(asText(tok)); continue; }

    const close = tag[1] === "/";
    const name  = tag[2].toLowerCase();
    const attrs = tag[3] || "";

    if (BLOCK.has(name) || INLINE.has(name)) {
      if (EMPTY.has(name)) { if (!close) out.push(`<${name}>`); continue; }
      out.push(`<${close ? "/" : ""}${name}>`);
      continue;
    }

    // An answer's headings are all one size. Nothing here is a document.
    if (HEADING_TAG.test(name)) { out.push(close ? "</h4>" : "<h4>"); continue; }

    if (name === "a") {
      if (close) { if (links.pop()) out.push("</a>"); continue; }
      const href = (attrs.match(/\bhref\s*=\s*"([^"]*)"/i)
                 || attrs.match(/\bhref\s*=\s*'([^']*)'/i) || [])[1];
      const safe = href ? safeHref(href) : null;
      links.push(Boolean(safe));
      if (safe) out.push(`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">`);
      continue;
    }

    // An image is its alt text — this page loads no picture an answer names.
    if (name === "img" && !close) {
      const alt = (attrs.match(/\balt\s*=\s*"([^"]*)"/i) || attrs.match(/\balt\s*=\s*'([^']*)'/i) || [])[1];
      if (alt) out.push(esc(alt));
      continue;
    }

    if (UNWRAP.has(name)) continue;

    // Anything else — a <script> off the parser's maths path, say — is shown
    // as the text it is, never run.
    out.push(asText(tok));
  }

  // An <a> the parser never closed.
  while (links.length) if (links.pop()) out.push("</a>");
  return out.join("");
};

// --------------------------------------------------------------------------
// Autolinking
// --------------------------------------------------------------------------

/**
 * Hosts whose last label is a real top-level domain AND is not something
 * this corpus says in passing. ".NET 4 to .NET 8" and "Node.js" both look
 * like hostnames to a greedy matcher; neither is one. The allowlist is the
 * cheapest way to be sure, and an answer that needs a .tv link can have one
 * added here.
 */
const TLD = "com|org|net|io|ai|dev|co|edu|gov|app|me|info|xyz";

const URL_IN_TEXT = new RegExp(
  "(?:https?://[^\\s<>()]+"                                      // explicit scheme
  + "|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:" + TLD + ")"    // bare host
  + "(?:/[^\\s<>()]*)?)",                                        // optional path
  "gi",
);

/** Sentence punctuation that followed the link rather than belonging to it. */
const TRAILING = /[.,;:!?'")\]]+$/;

/** Elements whose text is not prose and must not be linkified. */
const NO_LINKS = new Set(["A", "CODE", "PRE"]);

/**
 * Turn a bare address in the text into a link, in place.
 *
 * The parser does not do this — it links `[text](url)` and `<url>`, and
 * leaves "amazon.com/dp/1968318747" exactly as written. Every link the
 * corpus actually contains is bare, because that is how a person writes one
 * in a sentence, so without this the one answer with something to sell ends
 * in an address the reader has to retype.
 */
export const autolink = (root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const pending = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let ancestor = node.parentNode, skip = false;
    while (ancestor && ancestor !== root) {
      if (NO_LINKS.has(ancestor.nodeName)) { skip = true; break; }
      ancestor = ancestor.parentNode;
    }
    if (!skip && URL_IN_TEXT.test(node.data)) pending.push(node);
    URL_IN_TEXT.lastIndex = 0;
  }

  for (const node of pending) {
    const fragment = document.createDocumentFragment();
    let last = 0;
    URL_IN_TEXT.lastIndex = 0;

    for (let m = URL_IN_TEXT.exec(node.data); m; m = URL_IN_TEXT.exec(node.data)) {
      const raw = m[0].replace(TRAILING, "");
      if (!raw) continue;
      const href = safeHref(/^https?:/i.test(raw) ? raw : `https://${raw}`);
      if (!href) continue;

      fragment.appendChild(document.createTextNode(node.data.slice(last, m.index)));
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = raw;
      fragment.appendChild(a);
      last = m.index + raw.length;
    }

    fragment.appendChild(document.createTextNode(node.data.slice(last)));
    node.parentNode.replaceChild(fragment, node);
  }

  return root;
};

/**
 * An answer's Markdown as a detached DocumentFragment, ready to be revealed
 * a character at a time.
 *
 * `template.innerHTML` is safe here and only here: sanitize() has already
 * rebuilt every tag from the allowlist, and the template is inert — its
 * contents are parsed but never run, loaded or connected to the document.
 */
export const toFragment = (text) => {
  const template = document.createElement("template");
  template.innerHTML = sanitize(mdToHtml(prepare(text)));
  return autolink(template.content);
};
