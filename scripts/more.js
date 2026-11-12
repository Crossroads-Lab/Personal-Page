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
 * How much taller the SCREEN is than the viewport the browser reports.
 *
 * This is the number the whole cut problem turns on, and no CSS unit
 * exposes it. A phone browser paints into the strip its own floating
 * chrome sits over: innerHeight stops short of it, 100lvh stops short of
 * it, and env(safe-area-inset-bottom) read 0 on the device where it was
 * happening. screen.height does not stop short of it — it is the whole
 * display.
 *
 * Measured rather than assumed, so a notch, a home indicator, a taller
 * phone or a landscape rotation all come out in the wash. Capped at 40%
 * of the screen because a browser that is NOT full-screen (a desktop
 * window, a tablet in split view) would otherwise report the whole
 * desktop and push the diagonal into the next county; css/common.css
 * only consumes it on (hover: none) anyway, so the cap is a second belt.
 */
const measureScreenSlack = () => {
  const screenHeight = window.screen?.height ?? 0;
  const slack = Math.max(0, Math.round(screenHeight - window.innerHeight));
  const capped = Math.min(slack, Math.round(screenHeight * 0.4));
  document.documentElement.style.setProperty("--screen-slack", `${capped}px`);
};

measureScreenSlack();
addEventListener("resize", measureScreenSlack);
addEventListener("orientationchange", measureScreenSlack);

/*
 * How far through its arrival the cut is, as a number from 0 to 1.
 *
 * This replaces a threshold. The cut used to sit in one of two places
 * and swap between them, which meant picking a scroll position for the
 * swap and hoping nobody was looking at the line when it happened. Tying
 * it to the scroll instead means there is nothing to hide: the line
 * starts horizontal and below the first screen, and tilts into its
 * diagonal as the page moves, at exactly the rate the finger moves.
 *
 * 18% of a viewport to complete — a thumb's worth, not half a screen.
 *
 * It was half a viewport, which made the whole arrival feel like it
 * started from way too low: the cut has a hard resting floor (see
 * --cut-rest) and a slow climb out of it means a long scroll looking at
 * nothing. Measured against Will's numbers, the dark used to appear
 * after 137px of scroll and now appears after 71.
 *
 * Relative to the viewport rather than a pixel count, so it is the same
 * gesture on a small phone and a large desktop.
 */
const travel = () => Math.max(1, window.innerHeight * 0.18);

let last = -1;

/*
 * Written straight out of the scroll handler, NOT deferred to a frame.
 *
 * The first version coalesced with requestAnimationFrame, which is the
 * usual advice and is wrong here. On iOS the scroll runs on the
 * compositor and rAF callbacks are not serviced while a flick is in
 * flight — so the property only moved once the scroll came to rest, and
 * the line did not tilt, it arrived already tilted. The same thing shows
 * up in a backgrounded tab: measured in a hidden browser pane, scrollY
 * went 0 to 200 and not one frame callback ran.
 *
 * What it costs is a single custom-property write per scroll event. The
 * guard below drops the ones too small to see, so a flick writes tens of
 * times, not hundreds.
 */
const paintProgress = () => {
  const progress = Math.min(1, Math.max(0, window.scrollY / travel()));
  if (Math.abs(progress - last) < 0.004 && progress !== 0 && progress !== 1) return;
  last = progress;
  document.documentElement.style.setProperty("--cut-progress", progress.toFixed(4));
};

paintProgress();
addEventListener("scroll", paintProgress, { passive: true });
addEventListener("resize", () => { measureScreenSlack(); paintProgress(); });

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
