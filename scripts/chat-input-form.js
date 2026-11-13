"use strict"

import { content, displayTextContent } from "./content.js?v=bc5dff6f";
import { fastRead, plainRead, fastReadOn, rememberFastRead } from "./bionic.js?v=50e4dccf";
import { createThinkingNode } from "./createThinkingNode.js?v=31debead";
import { ask } from "./api.js?v=091fa826";

// --------------------------------------------------------------------------
// Cached DOM references (queried once for performance & clarity)
// --------------------------------------------------------------------------

const input = document.getElementById("chat-input");
const form = document.getElementById("chat-input-form");
const leftActions = document.getElementById("chat-input-left-buttons");
const rightActions = document.getElementById("chat-input-right-buttons");
const share = document.getElementById("dest-share-profile");

// In-flight request, so the stop button can actually cancel it rather than
// just hiding a response that still arrives and costs money.
let inFlight = null;

// Interrupt thinking.
const stopThinking = () => (
  document.body.removeAttribute("thinking"),
  content.innerHTML = "",
  typeof stopDisplay === "function" && stopDisplay()
);

/**
 * The opening screen's markup, kept so "new chat" can put it back.
 *
 * Will: "new chat basically takes you back at the beginning."
 *
 * Captured ONCE, on the first animation frame after this module loads.
 * That timing is the fix for the bug the first version had: it captured
 * lazily inside startThinking, and showPreloaded — the path a starter
 * chip takes — does not call startThinking at all. It calls stopThinking,
 * which empties #content. So pressing a chip, which is the likeliest
 * first thing anyone does on a phone, wiped the opening screen with
 * nothing saved, and "new chat" then restored nothing. Typing a question
 * was the one route that worked, and it is the route I tested.
 *
 * A frame rather than immediately, because scripts/quick-links.js fills
 * the icon row from #destinations during module evaluation — index.js
 * imports it after this file. A callback queued here runs after all of
 * that, so the snapshot has the links in it.
 *
 * captureOpening is also called at the top of both paths that clear
 * #content, which is belt and braces: by then the rAF has long since
 * fired, and the null guard means neither can overwrite the snapshot with
 * an answer.
 */
let openingHTML = null;

const captureOpening = () => {
  if (openingHTML === null) openingHTML = content.innerHTML;
};

requestAnimationFrame(captureOpening);

// Start thinking.
const startThinking = (text) => {
  captureOpening();
  // Set the thinking state.
  document.body.setAttribute("thinking", "");
  // Whatever the tools were for is gone.
  document.body.removeAttribute("answer-ready");
  content.innerHTML = "";
  content.appendChild(createThinkingNode(text));
};

// Check if thinking.
const isThinking = () => document.body.hasAttribute("thinking");

// Stop current thinking.
document.getElementById("stop").onclick = event => {
  event.stopPropagation();

  inFlight?.abort();
  inFlight = null;
  stopThinking();
  stopDisplay = displayTextContent(
    "If there's anything else you want to know, ask away!",
    endDisplay,
    // A plain div, not answerSlot(): this is a line of consolation after
    // someone pressed stop, not an answer, and offering to copy it is daft.
    // A div rather than a span because what gets typed into it is a parsed
    // answer now, and a <p> inside a <span> is not a tree the HTML parser
    // would ever have produced.
    content.appendChild(document.createElement("div"))
  );
}

// Share is the one destination that is behaviour rather than a URL. This is
// the only implementation of it; the icon rows and the answer buttons both
// forward their clicks to the hidden #dest-share-profile below.
if (typeof navigator.share === "function") {
  share.onclick = event => {
    event.stopPropagation();
    navigator.share({
      title: "William Brendel's webpage",
      text: "View a summary of my professional experience, download my resume and connect on LinkedIn",
      url: window.location.href || document.URL || "william-brendel.com"
    });
  }
} else {
  share.style.display = "none";
}

// --------------------------------------------------------------------------
// Textarea resize + layout logic
// Handles:
// - enabling/disabling send button
// - switching to multiline layout
// - auto-growing textarea height
// --------------------------------------------------------------------------

const resize = () => {
  // Toggle "empty" state:
  // Send button should only activate when text or files exist
  input.value
    ? form.removeAttribute("empty")
    : form.setAttribute("empty", "");

  // Enable multiline layout if content exceeds one line
  input.scrollHeight > input.clientHeight &&
    form.classList.add("multiline");

  // Collapse back to single-line layout when text fits again
  (input.value.length * 12 <
    form.clientWidth -
    leftActions.clientWidth -
    rightActions.clientWidth -
    16) &&
    form.classList.remove("multiline");

  // An empty box is one line, always. Measuring it is what broke the live
  // site: before the stylesheet applied, the textarea was stretched by its
  // grid row, so scrollHeight read ~230px, that got written back as the
  // height, and the form locked itself open at full height. Locally the CSS
  // is on disk and applies before the first frame, so it never appeared.
  // Returning here breaks the loop whatever the styling state.
  if (!input.value) {
    input.style.height = "";
    form.classList.remove("multiline");
    return;
  }

  // Auto-resize textarea height to fit content
  input.style.height = "auto";                 // Reset first
  input.style.height = input.scrollHeight + "px"; // Then grow
};

// Resize dynamically while typing
input.addEventListener("input", resize);

// Re-evaluate layout on viewport resize (mobile rotation, etc.)
window.addEventListener("resize", resize);

// Initial layout sync once the page is genuinely styled.
//
// requestAnimationFrame fires after the first paint, which is not the same
// as after the stylesheets apply — css/index.css pulls the rest in through
// @import, and Poppins comes from Google Fonts. Measuring in that window
// gives the metrics of an unstyled element. "load" waits for stylesheets;
// fonts.ready waits for the face the text will actually be laid out in.
const styled = Promise.all([
  document.readyState === "complete"
    ? Promise.resolve()
    : new Promise(r => window.addEventListener("load", r, { once: true })),
  document.fonts?.ready ?? Promise.resolve(),
]);

styled.then(() => {
  input.setAttribute("rows", input.getAttribute("rows") || 1);
  resize();
});

// --------------------------------------------------------------------------
// Keyboard behavior
// Enter sends, Shift+Enter inserts newline
// --------------------------------------------------------------------------

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.dispatchEvent(new Event("submit"));
  }
});

// --------------------------------------------------------------------------
// Form submission handler
// --------------------------------------------------------------------------
let stopDisplay;

/**
 * The answer has finished typing.
 *
 * Clearing `typing` is what puts the copy button within reach. It is hidden
 * until then on purpose: hovering a half-written answer used to summon a
 * button that would copy a sentence stopping mid-word, which is a worse
 * outcome than no button — you only find out after pasting it somewhere.
 */
let endDisplay = () => {
  for (const block of content.querySelectorAll(".answer-block[typing]")) {
    block.removeAttribute("typing");
  }
  stopDisplay = null;
  /* There is an answer on screen, so the tools above it have something to
     act on. css/chat-content.css keeps them display: none until this. */
  document.body.setAttribute("answer-ready", "");
};

/**
 * Set for exactly one submit, when the visitor pressed a question rather
 * than typing one. Read and cleared by the submit handler.
 *
 * A flag rather than an argument because a chip asks by filling the box and
 * dispatching submit — the same path a typed question takes, which is what
 * keeps the two indistinguishable on screen. The backend needs to tell them
 * apart even though the page does not.
 */
let pressed = false;
export const askAsChip = (question) => {
  pressed = true;
  input.value = question;
  input.dispatchEvent(new Event("input"));
  form.dispatchEvent(new Event("submit"));
};

/**
 * This visit's conversation, oldest first: `{ q, a }` per exchange.
 *
 * Kept on the page rather than the server because there are no sessions —
 * the backend answers each question on its own, which is what keeps it one
 * small process. So the page is the store, and the tail of it travels with
 * each request: it is how "what about at Samsung?" still retrieves anything,
 * and how the backend knows not to suggest a question already asked. See
 * server/server/history.js.
 *
 * A plain array, deliberately — not localStorage. It costs a few KB of RAM,
 * it is bounded by the trim below, and it dies with the tab, which is the
 * right lifetime for a transcript the visitor can already see on screen.
 */
const history = [];

/**
 * Keep only what the backend will actually read (server/history.js caps at
 * four exchanges), so the request body stays small and the page never grows
 * a list it does not use. Trimming here rather than at send time means the
 * array itself never becomes the leak.
 */
const HISTORY_TURNS = 4;
const remember = (turn) => {
  history.push(turn);
  if (history.length > HISTORY_TURNS) history.splice(0, history.length - HISTORY_TURNS);
  return turn;
};
form.addEventListener("submit", async event => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) return;

  // First question ends the opening state: the bar glides from the middle of
  // the page to the bottom, the icon row docks above it, and the chips retire
  // in favour of the follow-ups each answer brings. Set before the request,
  // not after it, so the page commits to the conversation while the answer
  // is still being written rather than sitting still and then jumping.
  document.body.setAttribute("chat-started", "");

  resetForm();
  startThinking();

  const controller = new AbortController();
  inFlight = controller;

  // Sent before this question is recorded: the history is what came BEFORE,
  // and the backend adds the current question itself.
  const sent = history.slice();
  const turn = remember({ q: message, a: "" });

  const fromChip = pressed;
  pressed = false;

  const { text, followUps, actions, aborted } = await ask(message, controller.signal, sent, fromChip);

  // The user hit stop, or started another question while this was running.
  // Either way this response is stale — the newer request owns the screen.
  if (aborted || inFlight !== controller) return;
  inFlight = null;
  if (!isThinking()) return;

  stopThinking();

  // The answer completes the exchange. Recorded now rather than after the
  // typing finishes, so a question asked mid-animation still sees it.
  turn.a = text;

  stopDisplay = displayTextContent(
    text,
    () => {
      endDisplay();
      // Actions first: they answer the question that was asked, where the
      // follow-ups only suggest another one.
      renderActions(actions);
      renderFollowUps(followUps);
    },
    answerSlot()
  );
});

/**
 * Where an answer gets typed, plus the button to take it away with you.
 *
 * The answer is the thing a visitor came for, and on a long one — a story
 * that runs four paragraphs — "select the text" is a worse experience on a
 * trackpad than it sounds. A recruiter reading this is very often about to
 * paste it somewhere.
 *
 * Desktop only, and only on hover: there is no hover on a phone, where the
 * button would have to be permanently visible and would sit on top of the
 * text it is covering. CSS decides that (`@media (hover: hover)`), not a
 * user-agent string.
 *
 * It stays out of reach until the answer has finished typing — the block
 * carries `typing` until endDisplay() clears it — because copying half a
 * sentence is a silent failure.
 *
 * @returns {HTMLElement} the node to type into.
 */
const answerSlot = () => {
  const block = document.createElement("div");
  block.className = "answer-block";
  // Dropped by endDisplay once the last character lands. See css/chat-content.css.
  block.setAttribute("typing", "");

  // A div for the same reason the consolation line is one: markdown.js
  // returns blocks, and a <p> inside a <span> is invalid nesting.
  const sink = block.appendChild(document.createElement("div"));

  /* No per-answer copy button any more. It was absolutely positioned over
     the answer and lived inside @media (hover: hover), which meant a
     phone never had one at all — and there is only ever one answer on
     screen, since every question clears #content. So it moved into the
     tools row, where it is reachable by thumb. Will: "the copy should now
     be next to BR button no?" */
  return content.appendChild(block).firstChild;
};

/**
 * Answers the page already holds, keyed by the question they answer.
 *
 * Filled from GET /starters, which ships not just the opening chips but the
 * tree of follow-ups underneath them — four levels down. Every heading in
 * the corpus is a question somebody wrote an answer to, and a section's
 * follow-ups are the other sections of the same document, so the part of
 * the corpus a visitor is likely to walk is a small graph that fits in a
 * few KB. Sending it with the chips means a whole thread of question and
 * answer costs exactly one request: the one the page made before anyone
 * clicked anything.
 *
 * Past the edge of the tree, clicking a follow-up asks the API as it always
 * did. Nothing here is required for the page to work.
 */
const precomputed = new Map();

/** Must match normalise() in server/server/starters.js. */
const asKey = (q) => String(q || "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .replace(/[?.!\s]+$/, "")
  .trim();

export const registerAnswers = (sections, more) => {
  for (const [key, node] of Object.entries(sections || {})) {
    if (node && typeof node.a === "string" && node.a) {
      precomputed.set(key, {
        q: typeof node.q === "string" ? node.q : key,
        a: node.a,
        f: Array.isArray(node.f) ? node.f : [],
      });
    }
  }
  if (Array.isArray(more)) lastResort.push(...more.filter(q => typeof q === "string"));
};

/** The answer we hold for a question, or null. */
const answerFor = (question) => precomputed.get(asKey(question)) || null;

/**
 * Questions already answered on screen.
 *
 * Not the same as the transcript. One answer can be several sections of a
 * document joined together — the opening chip for a story folds in three or
 * four — and every one of those headings is a question the tree will
 * otherwise offer as a follow-up to itself. The transcript records the
 * question that was asked; this records everything that got answered.
 */
const shown = new Set();

/** Offered when a thread runs out of document. See `more` in /starters. */
const lastResort = [];

/**
 * What to put under an answer: the follow-ups it came with, minus anything
 * already on screen — and if that empties the list, other things worth
 * asking, because an answer with no doors out of it is where a visit ends.
 */
const unasked = (questions) => {
  const used = (q) => shown.has(asKey(q)) || history.some(t => asKey(t.q) === asKey(q));
  const fresh = (questions || []).filter(q => !used(q));
  return fresh.length ? fresh : lastResort.filter(q => !used(q)).slice(0, 3);
};

/**
 * Show an answer the page already has, without asking for it.
 *
 * The opening chips carry their own answer — GET /starters ships the text
 * with the question, because a starter is a question the corpus was written
 * to answer and the answer does not change between visits. So pressing one
 * is not a request at all: no fetch, no thinking dot, no second of waiting
 * on the three questions a visitor is most likely to press first.
 *
 * Everything else is identical to a real answer on purpose — same typing
 * animation, same follow-ups underneath, same entry in the transcript that
 * travels with the next question. A visitor should not be able to tell
 * which of their questions cost money.
 *
 * @returns {boolean} false if there was nothing preloaded, so the caller can
 *   fall back to asking.
 */
export const showPreloaded = (question, text, followUps = [], actions = [], covers = []) => {
  if (!question || !text) return false;

  // Everything this answer puts on screen, so none of it comes back as a
  // suggestion of what to read next.
  shown.add(asKey(question));
  for (const heading of covers) shown.add(asKey(heading));

  // A chip pressed while an earlier question is still in flight: that
  // request now owns nothing, and must not land on top of this.
  inFlight?.abort();
  inFlight = null;

  document.body.setAttribute("chat-started", "");
  resetForm();
  captureOpening();               // before the line below throws it away
  stopThinking();                 // clears #welcome and any running typing

  remember({ q: question, a: text });

  stopDisplay = displayTextContent(
    text,
    () => {
      endDisplay();
      renderActions(actions);
      renderFollowUps(unasked(followUps));
    },
    answerSlot(),
  );
  return true;
};

/**
 * The four places an answer can send someone, keyed exactly as the backend
 * whitelists them (server/app.js ACTIONS).
 *
 * The destination is read off #destinations rather than written here, so
 * there is one list on the page and not four: change the Calendly link in
 * index.html and this follows. A key whose element is missing renders
 * nothing, which is the same outcome as the model inventing one.
 */
const ACTION_TARGETS = {
  resume:   { id: "dest-resume",        label: "Download my resume" },
  linkedin: { id: "dest-linkedin",      label: "View my LinkedIn" },
  book:     { id: "dest-book-call",     label: "Book 30min with me" },
  share:    { id: "dest-share-profile", label: "Share my profile" },
  thebook:  { id: "dest-the-book",      label: "Get the book" },
};

/**
 * Render the answer's actions as buttons that actually go somewhere.
 *
 * An answer used to be able only to describe where a link was — "open the
 * menu at the bottom left and choose Download my resume" — which is a page
 * telling someone where a button is instead of giving them one. That menu
 * is gone; these are not. These are
 * the same destinations, put under the answer that called for them.
 *
 * Each is a clone of the #destinations entry, so it carries that entry's
 * href, target and icon. Share has no href — it calls navigator.share — so
 * that one forwards the click rather than duplicating the logic.
 */
const renderActions = (actions) => {
  const wanted = (actions || [])
    .map(key => [key, ACTION_TARGETS[key]])
    .filter(([, target]) => target && document.getElementById(target.id));
  if (!wanted.length) return;

  const list = document.createElement("div");
  list.className = "answer-actions";

  for (const [, target] of wanted) {
    const source = document.getElementById(target.id);
    const isLink = source.tagName === "A";
    const node = document.createElement(isLink ? "a" : "button");
    node.className = "answer-action liquid-glass";

    if (isLink) {
      node.href = source.href;
      node.target = source.target || "_blank";
      node.rel = "noopener";
    } else {
      node.type = "button";
      // Share is behaviour, not a URL: let the one implementation run.
      node.onclick = (event) => { event.stopPropagation(); source.click(); };
    }

    node.textContent = target.label;
    const icon = source.querySelector("img");
    if (icon) {
      const copy = document.createElement("img");
      copy.src = icon.src;
      copy.alt = "";
      node.appendChild(copy);
    }
    list.appendChild(node);
  }

  content.appendChild(list);
};

/**
 * Render follow-up questions as clickable prompts. Clicking one asks it,
 * which is the cheapest way to show a visitor what else the corpus covers.
 */
/**
 * Shrink a wrapped chip to the width of its longest line.
 *
 * `width: fit-content` hugs a chip that fits on one line and gives up on
 * one that does not: max-content is wider than the column, so the box falls
 * back to the full column and a question that wraps after six words sits in
 * a pill stretching the whole width with half its last line empty. CSS has
 * no "as wide as the widest line it actually used" — the only thing that
 * knows is layout, after the fact.
 *
 * So ask it. A Range over the chip's text returns one rect per line box;
 * the widest of those plus the padding is the width the pill should have
 * had. `text-wrap: balance` (css/chat-content.css) runs first and evens the
 * lines out, so what this measures is already the tidy shape.
 *
 * Re-wrapping is the thing to watch: narrowing a box can push a word onto
 * another line, which would make the measurement a lie. The new width is
 * the widest line exactly, so the break points hold — but it is checked,
 * and the chip goes back to the full column if the line count moves.
 */
const hug = (button) => {
  const lines = () => {
    const range = document.createRange();
    range.selectNodeContents(button);
    return [...range.getClientRects()].filter(r => r.width > 0);
  };

  const before = lines();
  if (before.length < 2) return;        // one line: fit-content already hugs

  const style = getComputedStyle(button);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const widest = Math.max(...before.map(r => r.width));

  button.style.width = `${Math.ceil(widest + padding) + 1}px`;
  if (lines().length !== before.length) button.style.width = "";
};

/**
 * A measured width is only true for the column it was measured in, so every
 * chip on screen is remeasured when that column changes.
 *
 * A ResizeObserver on the column rather than a window resize listener: the
 * column also moves when the scrollbar appears, when the viewport is
 * emulated, and when the keyboard opens on a phone — none of which reliably
 * fire `resize`, and all of which leave a chip wearing a width that was
 * right for a different layout.
 *
 * Width only. Setting a chip's width can change the column's height, and
 * reacting to that would be a loop.
 */
let lastColumn = 0;
new ResizeObserver((entries) => {
  const width = Math.round(entries[0].contentRect.width);
  if (width === lastColumn) return;
  lastColumn = width;

  const chips = content.querySelectorAll(".follow-up");
  for (const chip of chips) chip.style.width = "";
  for (const chip of chips) hug(chip);
}).observe(content);

const renderFollowUps = (questions) => {
  if (!questions?.length) return;

  const list = document.createElement("div");
  list.className = "follow-ups";

  for (const question of questions) {
    const button = document.createElement("button");
    button.type = "button";
    // liquid-glass so a chip reads as the same material as the input bar,
    // which is where clicking one puts the question anyway.
    button.className = "follow-up liquid-glass";
    // textContent, not innerHTML — these strings come from the model.
    button.textContent = question;
    button.onclick = (event) => {
      event.stopPropagation();

      // Already in hand: render it rather than buying it again. This is
      // what makes the tree worth shipping — the second and third questions
      // of a thread are as instant as the first.
      const held = answerFor(question);
      if (held && showPreloaded(held.q, held.a, held.f)) return;

      // Not in the shipped tree. Still a question the corpus wrote, so tell
      // the backend it was pressed and it will answer from the section
      // rather than from retrieval.
      resize();
      askAsChip(question);
    };
    list.appendChild(button);
  }

  content.appendChild(list);

  // After it is in the document: the measurement needs real line boxes.
  for (const chip of list.children) hug(chip);
};

const resetForm = () => {
  // Reset input.
  input.value = "";
  resize();

  // Clear file state.
  form.setAttribute("empty", "");
}

// --------------------------------------------------------------------------
// The keyboard
//
// Nothing here any more, on purpose.
//
// There was a scroll correction: on the visual viewport's resize, nudge
// the page until the bottom of the bar's margin box met the top of the
// keyboard. It was written against a screenshot where iOS had left the
// bar a third of the way up the screen with the dark section filling the
// gap underneath it.
//
// It never worked on the device, and the reason was not the correction.
// #chat-input was 14px, and iOS Safari zooms the whole page in when you
// focus a field under 16px. So the visual viewport the correction
// measured against was the ZOOMED one — every number it read was in
// different units from the ones it wrote — and each attempt moved the
// page somewhere new. Three rounds of screenshots, all of them the same
// bug wearing a different number.
//
// The font-size is 16px now (css/chat-input.css) and there is no zoom to
// correct for. Safari scrolls the focused field into what is left of the
// screen on its own, which is what it was always trying to do. If the
// result still reads wrong, the fix belongs in where the bar sits, not
// in a second opinion about where the page should scroll.
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// While the keyboard is up
//
// Nothing. On purpose, and it is worth saying what used to be here.
//
// The page has to be one screen with nothing to scroll while someone is
// typing, and the second section has to be out of the document, or Safari
// scrolls a two-screen page to put the field in view and leaves the bar a
// third of the way up with the diagonal underneath it. That was done from
// JavaScript: take the focus on pointerdown, shorten the page, flush
// layout, hand the focus back — all inside the one gesture, because iOS
// will not open a keyboard for a focus() that has left it.
//
// It is a selector now. css/more.css switches on
// :has(#chat-input:focus, #chat-input:active), inside (hover: none), and
// does the same three things: one viewport, nothing to scroll, no second
// page. :active matches while the finger is still down, which is the
// moment pointerdown fired.
//
// Will: "no trick to capture the input and redispatch it for now. Let's
// keep things simple."
//
// Gone with it: the visualViewport resize and scroll listeners, the
// innerHeight minus (offsetTop + height) arithmetic, --keyboard,
// --keyboard-top, the provisional 42svh, the pinned bar, the blur and
// re-focus, the layout flush, ?pin.
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// The two tools above an answer
//
// Both appear only once body[answer-ready] is set, which endDisplay does when
// the last character lands. Icons, no labels — Will: "the buttons at the top
// should be discreet, maybe only icons?"
// --------------------------------------------------------------------------

const newChatButton = document.getElementById("new-chat");
const fastReadButton = document.getElementById("fast-read");
const copyButton = document.getElementById("copy-answer");

/**
 * Copy whatever answer is on screen.
 *
 * .answer-block's first child is the sink the text is typed into; the
 * block itself is read rather than the sink so a bionic-transformed
 * answer still copies as plain prose — textContent flattens the <b>
 * wrappers back out, which is exactly what belongs on a clipboard.
 */
const toast = document.getElementById("toast");
let toastTimer;

/**
 * Say something for a moment and then stop.
 *
 * The timer is cleared first so a second tap restarts the clock rather
 * than inheriting the remainder of the first one — otherwise two taps a
 * second apart leave the message up for 0.6s.
 */
const say = (message) => {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.setAttribute("shown", "");
  toastTimer = setTimeout(() => toast.removeAttribute("shown"), 1600);
};

copyButton?.addEventListener("click", async () => {
  const block = content.querySelector(".answer-block");
  const text = (block?.textContent || "").trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    say("Copied");
    copyButton.setAttribute("copied", "");
    setTimeout(() => copyButton.removeAttribute("copied"), 1600);
  } catch {
    /* Denied, or an insecure context — the Clipboard API wants https or
       localhost. Select the answer instead, so the keyboard shortcut a
       desktop visitor would reach for actually has something to act on.
       
       And say THAT rather than "Copied", which would be a lie the
       visitor only discovers when they paste. No tick either: the button
       did not do the thing. */
    const range = document.createRange();
    range.selectNodeContents(block);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    /* What to tell them depends on what they have. navigator.platform
       reports "iPhone" there, so the old Mac-or-Ctrl test sent an iPhone
       a keyboard shortcut it has no keyboard for. A touch device gets
       the gesture that actually works: the text is already selected, so
       a long press raises iOS's own Copy callout. */
    say(matchMedia("(hover: none)").matches
      ? "Selected — press and hold to copy"
      : navigator.platform?.startsWith("Mac") ? "Selected — press \u2318C" : "Selected — press Ctrl+C");
  }
});

/** Where fast read applies: the answers, not the furniture around them. */
const answerBlocks = () => content.querySelectorAll(".answer-block");

const paintFastRead = (on) => {
  if (!fastReadButton) return;
  fastReadButton.setAttribute("aria-pressed", on ? "true" : "false");
};

// The remembered setting, restored before anything is asked, so the first
// answer of a return visit types the way the last one read.
paintFastRead(fastReadOn());

fastReadButton?.addEventListener("click", () => {
  const on = !fastReadOn();
  rememberFastRead(on);
  paintFastRead(on);

  /* Applied to what is already on screen, as well as remembered for what
     comes next. Toggling a reading mode that only affects the NEXT answer
     is a setting, not a control — you would have to ask something else to
     find out what it does. */
  for (const block of answerBlocks()) (on ? fastRead : plainRead)(block);
});

/**
 * Start again.
 *
 * Everything the conversation accumulated goes: the in-flight request, the
 * transcript, this visit's history, and the three attributes that make the
 * page look like a conversation rather than an opening screen. The chips
 * come back on their own — chat-started is what was hiding them.
 *
 * history.length = 0 rather than a new array, because the array is closed
 * over by remember() and by the submit handler; reassigning it here would
 * leave both of them writing to the one nobody reads.
 */
newChatButton?.addEventListener("click", () => {
  inFlight?.abort();
  inFlight = null;

  stopThinking();
  history.length = 0;

  document.body.removeAttribute("answer-ready");
  document.body.removeAttribute("chat-started");
  document.body.removeAttribute("blured");

  /* The headline and the icon row back, not just the layout.
     
     stopThinking empties #content, and #content is where the opening
     screen lives — so without this the page returns to the opening
     ARRANGEMENT around an empty middle: chips and bar in the right
     places, nothing above them. */
  if (openingHTML !== null) content.innerHTML = openingHTML;

  resetForm();

  /* NO focus() here, and that was a real bug rather than a preference.
   
     Focusing the field summons the keyboard, which puts the page into the
     typing state — .hero fixed, #more out, body frozen — at the exact
     moment the reset's own transitions are still running. Safari then
     slides the visual viewport against a layout that is still moving and
     lands nowhere useful: Will's screenshot showed the first screen gone
     entirely, just the photograph and the keyboard.
   
     Nobody asked for it either. "New chat" means put the opening screen
     back; whether to type next is the visitor's decision, and on a phone
     an unrequested keyboard is the single most intrusive thing a page can
     do. */
});
