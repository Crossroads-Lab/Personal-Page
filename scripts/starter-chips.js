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

const CONTACT_LABEL = "Contact";

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
 * Trim the row until it fits on one line.
 *
 * Four chips fit across a desktop bar and do not fit across a phone, and the
 * exact point in between depends on which labels the server happened to send
 * and on whether Poppins has loaded yet. A breakpoint would have to guess all
 * three, so this measures instead: drop starters from the end until the row
 * stops overflowing. Contact is never dropped — it is the only chip that goes
 * somewhere the visitor cannot reach by typing.
 */
const fit = () => {
  // Hidden (chat started, or not laid out yet): nothing to measure, and a
  // zero-width box would read as "everything overflows" and strip the row.
  if (!container.clientWidth) return;
  while (
    container.scrollWidth > container.clientWidth &&
    container.children.length > 2            // keep one starter + Contact
  ) {
    container.children[container.children.length - 2].remove();
  }
};

/** The last list fetched, so a resize can rebuild what a narrower one cut. */
let current = [];

const render = (starters) => {
  if (!container) return;
  current = starters;
  container.replaceChildren(
    ...starters.map(({ label, q }) => chip(label, () => ask(q))),
    chip(CONTACT_LABEL, openContactMenu, true),
  );
  fit();
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
  document.fonts?.ready.then(() => render(current));
});

// A rotation or a resized window changes how many fit, in both directions,
// so rebuild the full list and let fit() cut it again rather than only ever
// removing. Skipped once a conversation exists — the chips are gone by then.
let resizeTimer;
window.addEventListener("resize", () => {
  if (document.body.hasAttribute("chat-started")) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(current), 150);
});
