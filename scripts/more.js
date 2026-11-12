"use strict"

import { askAsChip } from "./chat-input-form.js?v=3d810244";

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

/*
 * The scaffolding that was here — ?solo and ?shell, which stripped the
 * page down to find which piece was breaking the keyboard — is gone. The
 * answer it found is now the page: the document does not scroll, body
 * does, and the first screen is exactly one viewport. test.html is the
 * baseline it was all built against.
 */
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
  /* document.body, not window: body is the scroller now and the document
     does not scroll at all, so window.scrollTo moves nothing. */
  document.body.scrollTo({ top: 0, behavior: REDUCED.matches ? "instant" : "smooth" });
  setTimeout(() => {
    if (document.body.scrollTop > 4) document.body.scrollTo({ top: 0, behavior: "instant" });
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
 * measurePage used to live here, writing --page-height from
 * screen.height and screen.availHeight so the cut could rest on the last
 * row of pixels iOS actually paints rather than on any viewport.
 *
 * It is gone because the question is gone. That strip only exists when
 * Safari FLOATS its bottom bar, which it does over a scrollable
 * document; the document does not scroll now, so the bar docks, brings
 * its own backdrop, and the page ends cleanly at 100dvh. Four properties
 * failed to report that strip — window.screenY, both safe-area insets,
 * screen.availHeight — and none of them need to any more.
 */

/*
 * The scroll handler that drove --cut-progress is gone too. The swing is
 * a scroll-driven CSS animation now (css/more.css): the timeline is
 * body's own scroll, so it runs on the compositor.
 *
 * Which also retires the reason it could not be coalesced with
 * requestAnimationFrame — on iOS the scroll runs on the compositor and
 * rAF callbacks are not serviced while a flick is in flight, so the
 * property only moved once the scroll came to rest and the line did not
 * tilt, it arrived already tilted. Nothing is written per frame now.
 */

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

// --------------------------------------------------------------------------
// Where "More" lands
//
// Both cues are plain anchors to #more, and the browser puts the top of
// that box at the top of the window. The box starts ABOVE the cut — the
// diagonal is drawn inside it — so you arrive looking up at the line
// with the hero still on screen.
//
// A negative scroll-margin was the first answer and it kept coming up
// short: the margin is a stylesheet value, resolved against --cut-rest,
// which JS writes after the page has loaded and rewrites on every
// resize. Whatever it happened to be at the moment of the tap is what
// you got.
//
// So measure it at the tap instead. The lowest point the line ever
// reaches is --cut below the section's box top — the left end at full
// tilt, which is where it will be by the time the scroll finishes.
// Nothing above that is worth arriving at.
// --------------------------------------------------------------------------

/*
 * Where "More" lands: the bottom of body's scroll range.
 *
 * The section's top plus --cut: the diagonal's lowest point, level with
 * the top of the screen. Which is also the snap position css/more.css
 * gives it, by the same arithmetic in a negative scroll-margin.
 *
 * NOT the scroller's maximum, which is what this was for one draft. On
 * test.html the second page is exactly one viewport, so its top and the
 * bottom of the scroll range are the same place; here it is real content
 * and taller than the screen, and scrolling to the end lands on the
 * bottom of the dark section rather than the start of it.
 *
 * resolve() rather than reading padding-top, which is var(--cut) in the
 * base rule and calc(var(--cut) + 40px) under 767px.
 */
const resolve = (value) => {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:${value}`;
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).height) || 0;
  probe.remove();
  return px;
};

const landing = () => {
  if (!more) return 0;
  /* offsetTop, not a rect plus the current scroll: offsetParent is body,
     which IS the scroller, so this is already in scroll coordinates and
     does not care where the page happens to be sitting. */
  return Math.round(more.offsetTop + resolve("var(--cut)"));
};


for (const cue of document.querySelectorAll('a[href="#more"]')) {
  cue.addEventListener("click", (event) => {
    if (!more) return;
    event.preventDefault();
    document.body.scrollTo({ top: landing(), behavior: REDUCED.matches ? "instant" : "smooth" });
    // Same lesson as toTop(): smooth is a request, not a promise.
    setTimeout(() => {
      if (Math.abs(document.body.scrollTop - landing()) > 4) {
        document.body.scrollTo({ top: landing(), behavior: "instant" });
      }
    }, REDUCED.matches ? 0 : SCROLL_MS);
  });
}
