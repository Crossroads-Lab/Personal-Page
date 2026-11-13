"use strict"

// --------------------------------------------------------------------------
// Opening suggestions
//
// Before the first question the page offers three things to ask and a way to
// reach William. The questions come from the backend so they reflect the
// corpus and vary between visits; the request is free and touches no model,
// but the page never depends on it — if the API is slow, rate-limited or
// down, the fallback below is what a visitor sees, and the only difference
// is that the suggestions are the same every time.
//
// Each suggestion arrives with its answer attached. A starter is a question
// the corpus was written to answer — the section that answers it is sitting
// in a markdown file and has not changed since it was written — so there is
// nothing to work out at the moment someone presses one. The backend ships
// the text with the question (server/server/starters.js) and pressing a chip
// renders it immediately: no request, no thinking dot, nothing to wait on,
// on the three questions a visitor is most likely to press first.
//
// A chip with no answer attached — the fallback list below, or an older
// backend — asks the normal way and nothing looks different.
// --------------------------------------------------------------------------

import { API_BASE } from "./api.js?v=091fa826";
import { showPreloaded, registerAnswers, askAsChip } from "./chat-input-form.js?v=09b06d8b";

const container = document.getElementById("starter-chips");
const chatContainer = document.getElementById("chat-input-container");
const input = document.getElementById("chat-input");
const form = document.getElementById("chat-input-form");

// Used when the API cannot be reached. Deliberately a different three from
// the server's pool so a visitor seeing these twice is not a tell that
// something is broken — they just look like a choice.
const FALLBACK = [
  { label: "Into AI",     q: "How did you get into AI?" },
  { label: "Big tech",    q: "Why did you leave big tech?" },
  { label: "Core values", q: "What are your core values?" },
];

/* A chip shows a topic, asks a sentence, and — where the backend sent one —
   already holds the answer. Anything that arrives as a bare string (an older
   server, a cached response) becomes label and question, which is how this
   behaved before the two were split; it simply has no preloaded answer and
   falls back to asking. */
const normalise = (s) =>
  typeof s === "string" ? { label: s, q: s }
  : (s && typeof s.q === "string") ? {
      label: s.label || s.q,
      q: s.q,
      a: typeof s.a === "string" ? s.a : "",
      followUps: Array.isArray(s.followUpQuestions) ? s.followUpQuestions : [],
      actions: Array.isArray(s.actions) ? s.actions : [],
      covers: Array.isArray(s.covers) ? s.covers : [],
    }
  : null;

/** Three suggestions: the corpus's if we can get them, ours if we cannot. */
const fetchStarters = async () => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${API_BASE}/starters`, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return FALLBACK;
    const { starters, sections, more } = await r.json();

    // The tree under the chips: every follow-up, and every follow-up of
    // those, four levels down. Handed to the chat module so that clicking
    // any of them is as instant as clicking the chip itself. Absent from an
    // older backend, in which case follow-ups ask the API as they always did.
    registerAnswers(sections, more);

    const clean = (Array.isArray(starters) ? starters : []).map(normalise).filter(Boolean);
    return clean.length ? clean.slice(0, 3) : FALLBACK;
  } catch {
    return FALLBACK;             // offline, blocked, slow: show something
  }
};

const chip = (label, onClick) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "starter-chip liquid-glass";
  // textContent, not innerHTML — these come over the wire.
  b.textContent = label;
  b.onclick = (event) => { event.stopPropagation(); onClick(); };
  return b;
};

/**
 * Put a question in the box and send it, exactly as if it had been typed —
 * except that the backend is told it was pressed, so it answers from the
 * section the question is the heading of rather than from retrieval.
 */
const ask = (question) => askAsChip(question);

/**
 * Press a chip: show what we already have, or ask for it.
 *
 * showPreloaded returns false when there is no answer attached, which is the
 * fallback list and any response from a backend that predates this. Asking
 * is then exactly what pressing a chip used to do — and the backend
 * short-circuits a starter it recognises anyway, so the visitor still gets
 * the same text, just one round trip later.
 */
const press = ({ q, a, followUps, actions, covers }) =>
  showPreloaded(q, a, followUps, actions, covers) || ask(q);

/**
 * Mark the row when it has more chips than fit, and say which way.
 *
 * The row scrolls rather than wrapping or dropping anything, and a row with
 * no visible edge looks like a row that ends there. The attribute drives a
 * fade on whichever side has more — the one honest cue available.
 */
const markOverflow = () => {
  if (!container || !container.clientWidth) return;   // hidden: nothing to mark
  const slack = container.scrollWidth - container.clientWidth;
  if (slack < 2) return container.removeAttribute("overflowing");
  const atStart = container.scrollLeft < 2;
  const atEnd = container.scrollLeft > slack - 2;
  container.setAttribute(
    "overflowing",
    atStart ? "end" : atEnd ? "start" : "both",
  );
};

container?.addEventListener("scroll", markOverflow, { passive: true });

const render = (starters) => {
  if (!container) return;
  // The More cue lives in this row but is not a suggestion — it is a link
  // to the section below. Held across the rebuild, because replaceChildren
  // would otherwise take it out with the fallback chips it replaces.
  const more = container.querySelector(".chip--more");
  // Mounted in the "entering" state so the chips arrive as the same staggered
  // wave they leave on, rather than appearing fully formed the instant the
  // fetch lands — after a beat of empty space that reads as a glitch.
  container.setAttribute("entering", "");
  container.replaceChildren(
    ...starters.map((starter) => chip(starter.label, () => press(starter))),
  );
  if (more) container.appendChild(more);
  markOverflow();

  // Two frames, not one. A single rAF can run before the browser has styled
  // the nodes that were just inserted, and the start state would never be
  // committed — the chips would simply appear, with no transition to run
  // from. The second frame guarantees there is something to animate out of.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => container.removeAttribute("entering")));
};

// Fade the chips while the visitor is composing, and bring them back if they
// click away without typing — a stray click should not cost the suggestions.
input?.addEventListener("focus", () => chatContainer.setAttribute("input-focused", ""));
input?.addEventListener("blur", () => {
  if (!input.value) chatContainer.removeAttribute("input-focused");
});

fetchStarters().then((starters) => {
  render(starters);
  // Measured again once Poppins is in: the fallback face is a different
  // width, so a row that fits before the swap can overflow after it.
  document.fonts?.ready.then(markOverflow);
});

// A rotation or a resized window changes whether the row overflows, and in
// which direction. Skipped once a conversation exists — the chips are gone.
let resizeTimer;
window.addEventListener("resize", () => {
  if (document.body.hasAttribute("chat-started")) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    markOverflow();
  }, 150);
});
