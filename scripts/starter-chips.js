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
  "How did you get into AI?",
  "Why did you leave big tech?",
  "What are your core values?",
];

const CONTACT_LABEL = "View contact info";

/** Three suggestions: the corpus's if we can get them, ours if we cannot. */
const fetchStarters = async () => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${API_BASE}/starters`, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return FALLBACK;
    const { starters } = await r.json();
    return Array.isArray(starters) && starters.length ? starters.slice(0, 3) : FALLBACK;
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

const render = (starters) => {
  if (!container) return;
  container.replaceChildren(
    ...starters.map(q => chip(q, () => ask(q))),
    chip(CONTACT_LABEL, openContactMenu, true),
  );
};

// Fade the chips while the visitor is composing, and bring them back if they
// click away without typing — a stray click should not cost the suggestions.
input?.addEventListener("focus", () => chatContainer.setAttribute("input-focused", ""));
input?.addEventListener("blur", () => {
  if (!input.value) chatContainer.removeAttribute("input-focused");
});

fetchStarters().then(render);
