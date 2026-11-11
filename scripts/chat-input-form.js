"use strict"

import { content, displayTextContent } from "./content.js?v=9235ae41";
import { createThinkingNode } from "./createThinkingNode.js?v=287efe19";
import { ask } from "./api.js?v=b970cf23";

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

// Start thinking.
const startThinking = text => (
  // Set the thinking state.
  document.body.setAttribute("thinking", ""),
  content.innerHTML = "",
  content.appendChild(createThinkingNode(text))
);

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
    content.appendChild(document.createElement("span"))
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
let stopDisplay, endDisplay = () => stopDisplay = null;

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

  const { text, followUps, actions, aborted } = await ask(message, controller.signal, sent);

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
    content.appendChild(document.createElement("span"))
  );
});

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
      input.value = question;
      resize();
      form.dispatchEvent(new Event("submit"));
    };
    list.appendChild(button);
  }

  content.appendChild(list);
};

const resetForm = () => {
  // Reset input.
  input.value = "";
  resize();

  // Clear file state.
  form.setAttribute("empty", "");
}