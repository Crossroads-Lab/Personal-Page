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
 * At the top, or not.
 *
 * --chrome-overscan holds the diagonal below the strip a phone paints
 * past its own viewport (css/common.css). That strip only exists at
 * scroll zero: once the page moves, the overscan is a hundred-odd pixels
 * of nothing between the portrait and the dark.
 *
 * Four pixels of tolerance, because a phone does not always come to rest
 * at exactly zero. The class flips while the diagonal is still well below
 * the fold, so the cut never moves anywhere anyone can see it.
 */
const TOP = 6;

/* A sliver pinned to the top of the document. While any of it is on
   screen the page is at rest; the moment it leaves, it is not.
   
   An observer rather than a scroll listener because a scroll listener is
   not guaranteed to run: measured in a browser pane that had been hidden,
   scrollY went from 0 to 200 and the scroll event fired zero times.
   IntersectionObserver reports from the compositor and does not care. The
   listener is kept as well — between them, one of the two always fires. */
const sentinel = document.createElement("div");
sentinel.setAttribute("aria-hidden", "true");
sentinel.style.cssText =
  `position:absolute;top:0;left:0;width:1px;height:${TOP}px;pointer-events:none;visibility:hidden`;
document.body.prepend(sentinel);

const markTop = (atTop = window.scrollY <= TOP) =>
  document.body.classList.toggle("at-top", atTop);

markTop();
new IntersectionObserver(([entry]) => markTop(entry.isIntersecting)).observe(sentinel);
addEventListener("scroll", () => markTop(), { passive: true });
addEventListener("resize", () => markTop());

/*
 * When the cues are worth showing.
 *
 * Two ways they stop being worth it: the cards are already on screen, or
 * the chat is working and an arrow pointing away from it is noise.
 *
 * NOT while an answer is up. That was the first rule here and it was
 * wrong: `chat-started` is set by the first question and never cleared, so
 * both cues disappeared permanently the moment anyone asked anything. The
 * section was still down there and still scrollable — there was simply
 * nothing left on the page that said so, which is the same as not having
 * it for most people. An answer is exactly when someone has finished
 * reading and is deciding what to do next.
 */
let cardsInView = false;

const sync = () => {
  const hide = cardsInView || document.body.hasAttribute("thinking");
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
