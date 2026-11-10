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
// --------------------------------------------------------------------------

import { API_BASE } from "./api.js";

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

const CONTACT_LABEL = "How to reach me";

/* A chip shows a topic and asks a sentence. Anything that arrives as a bare
   string — an older server, a cached response — becomes both, which is how
   this behaved before the two were split. */
const normalise = (s) =>
  typeof s === "string" ? { label: s, q: s }
  : (s && typeof s.q === "string") ? { label: s.label || s.q, q: s.q }
  : null;

/** Three suggestions: the corpus's if we can get them, ours if we cannot. */
const fetchStarters = async () => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${API_BASE}/starters`, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return FALLBACK;
    const { starters } = await r.json();
    const clean = (Array.isArray(starters) ? starters : []).map(normalise).filter(Boolean);
    return clean.length ? clean.slice(0, 3) : FALLBACK;
  } catch {
    return FALLBACK;             // offline, blocked, slow: show something
  }
};

const chip = (label, onClick, isContact = false) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "starter-chip liquid-glass";
  if (isContact) b.dataset.contact = "";
  // textContent, not innerHTML — these come over the wire.
  b.textContent = label;
  b.onclick = (event) => { event.stopPropagation(); onClick(); };
  return b;
};

/** Put a question in the box and send it, exactly as if it had been typed. */
const ask = (question) => {
  input.value = question;
  input.dispatchEvent(new Event("input"));     // let the form resize/enable
  form.dispatchEvent(new Event("submit"));
};

/** The contact chip opens the same menu the ⋮ opens — one list, not two. */
const openContactMenu = () => chatContainer.setAttribute("menu-visible", "");

/**
 * Mark the row when it has more chips than fit, and say which way.
 *
 * The row scrolls rather than wrapping or dropping anything, which on a phone
 * means Contact can sit past the right edge — and a row with no visible edge
 * looks like a row that ends there. The attribute drives a fade on whichever
 * side has more, the one honest cue that there is.
 */
const markOverflow = () => {
  if (!container.clientWidth) return;              // hidden: nothing to mark
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
  // Mounted in the "entering" state so the chips arrive as the same staggered
  // wave they leave on, rather than appearing fully formed the instant the
  // fetch lands — after a beat of empty space that reads as a glitch.
  container.setAttribute("entering", "");
  container.replaceChildren(
    ...starters.map(({ label, q }) => chip(label, () => ask(q))),
    chip(CONTACT_LABEL, openContactMenu, true),
  );
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
  resizeTimer = setTimeout(markOverflow, 150);
});
