"use strict"

import { askAsChip } from "./chat-input-form.js?v=8bef9bb6";

// --------------------------------------------------------------------------
// The second screen
//
// Two jobs, both small, both about keeping the cards and the chat from
// becoming two separate things:
//
//   1. "Ask about this" sends the card's question through the existing chat
//      and scrolls back up to watch it answer.
//   2. The two cues that point down here get out of the way once they have
//      been taken, or once the chat is busy.
//
// No second chat path. askAsChip is the function the suggestion chips call,
// so a card's question is indistinguishable from a pressed chip — which it
// is, in everything but where it was pressed.
// --------------------------------------------------------------------------

const more = document.getElementById("more");
const cues = () => document.querySelectorAll(".chip--more, .more-chevron");

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

/** Long enough for a smooth scroll to land, so the answer types on screen. */
const SCROLL_MS = 450;

/**
 * Put the page back at the top, and make sure it got there.
 *
 * `behavior: "smooth"` is a request, not a promise. Some browsers refuse to
 * animate it — and the ones that refuse do not fall back to jumping, they
 * do nothing at all. Measured in a pane with scroll animation disabled: a
 * smooth scrollTo sat at the same offset for three and a half seconds while
 * the same call with "instant" moved immediately. The visitor would have
 * pressed Ask about this and watched the cards sit there while an answer
 * they could not see typed itself a screen above.
 *
 * So: ask nicely, then check. If the page has not moved by the time the
 * question goes, move it outright.
 */
const toTop = () => {
  window.scrollTo({ top: 0, behavior: REDUCED.matches ? "instant" : "smooth" });
  setTimeout(() => {
    if (window.scrollY > 4) window.scrollTo({ top: 0, behavior: "instant" });
  }, REDUCED.matches ? 0 : SCROLL_MS);
};

/*
 * Ask about this.
 *
 * The scroll happens first and the question goes a beat later. Asking
 * immediately works, but the answer starts typing at the top of a page the
 * visitor is still looking at the bottom of — they arrive to a finished
 * paragraph and no sense that they caused it.
 *
 * With reduced motion the scroll is instant, so there is nothing to wait
 * for and the delay would just be a delay.
 */
for (const button of document.querySelectorAll("[data-ask]")) {
  button.addEventListener("click", () => {
    const question = button.dataset.ask;
    if (!question) return;

    toTop();
    if (REDUCED.matches) askAsChip(question);
    else setTimeout(() => askAsChip(question), SCROLL_MS);
  });
}

/*
 * When the cues are worth showing.
 *
 * Three ways they stop being worth it: the cards are on screen (the cue has
 * done its job), the chat is thinking, or there is an answer to read. The
 * last two matter because both cues sit in the furniture around the input
 * bar, and an arrow pointing away from an answer someone is reading is
 * noise at best.
 */
let cardsInView = false;

const sync = () => {
  const busy = document.body.hasAttribute("thinking")
    || document.body.hasAttribute("chat-started");
  const hide = cardsInView || busy;
  for (const cue of cues()) cue.classList.toggle("is-hidden", hide);
};

if (more && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    cardsInView = entry.isIntersecting;
    sync();
  }, { threshold: 0.3 }).observe(more);
}

// The chat sets `thinking` and `chat-started` on <body> and nothing tells us
// when. Watching the attributes is cheaper than a hook into the chat module,
// and it cannot fall out of step with it.
new MutationObserver(sync).observe(document.body, {
  attributes: true,
  attributeFilter: ["thinking", "chat-started"],
});

sync();
