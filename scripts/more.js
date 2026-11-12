"use strict"

import { askAsChip } from "./chat-input-form.js?v=d5c244e3";

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
 * ?solo — the first screen and nothing else.
 *
 * Will: "Please produce a version with no second page at all. None. And
 * let's take baby steps from there."
 *
 * The second section is removed from the document at load, along with
 * both cues, and none of the cut, the scroll-to-More or the keyboard
 * machinery is wired up. What is left is the hero, the bar, and
 * whatever Safari does with them on its own — a floor to measure from,
 * with nothing of mine in the way.
 *
 * Add one thing at a time from here.
 */
const SOLO = location.search.includes("solo");

if (SOLO) {
  for (const node of document.querySelectorAll("#more, .chip--more, .more-chevron")) {
    node.remove();
  }

  /* And nothing to scroll.
   
     Taking the section out still left a page taller than the window:
     the hero is 100lvh plus the chrome slack, and .hero::before hangs
     --portrait-sink below that again. Will: "You can still scroll on
     solo." Forty points of it, which is enough to drift the headline
     under the status bar and make the baseline something other than one
     screen.
     
     clip on the root, which cannot be scrolled by any means, and on the
     hero so its overhang stops adding height. The hero keeps its own
     size — shrinking it would move the portrait and the bar, and then
     this would be a baseline for a page that does not exist. */
  const lock = document.createElement("style");
  lock.textContent =
    "html, body { overflow: clip !important; } .hero { overflow: clip !important; }";
  document.head.appendChild(lock);
}

const more = SOLO ? null : document.getElementById("more");
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
 * How far down the glass the page actually paints.
 *
 * Not a viewport. Will's screenshots show iOS Safari painting page
 * content BELOW innerHeight, behind its own floating address bar: at
 * rest, with innerHeight, 100lvh and the dark edge all reading 836,
 * there was dark on the glass under all three. Measured off that
 * screenshot the page occupies 62.5 to 956 on a 956-point display, so
 * it paints 57 points further than any unit admits to.
 *
 * screen.availHeight is the one property that can say so. MDN: the
 * display, less whatever the device or user agent reserves for itself —
 * here, the status bar. Three others that looked like they should have
 * worked all return 0 on his phone: window.screenY,
 * env(safe-area-inset-top) and env(safe-area-inset-bottom), the last of
 * which is a documented Safari bug when the toolbar is hidden.
 *
 * Three conditions before it is trusted, because the reports of this
 * property on iOS are old and mixed:
 *
 *   the chrome floats      otherwise there is nothing to paint behind
 *   avail < glass          it reserved something, so it is reporting
 *   avail >= innerHeight   it is at least a whole viewport, so it is
 *                          not the stale 20px-address-bar answer from
 *                          the 2015 reports
 *
 * Fail any of them and the property is left unset, css/common.css falls
 * back to 100lvh, and the cut stays where it is today rather than
 * dropping 60 points on an unverified reading.
 *
 * Re-read on resize and rotation: the toolbar collapsing changes
 * innerHeight, and a turn swaps width and height.
 */
const FLOATING_CHROME = matchMedia("(hover: none)");

const measurePage = () => {
  const root = document.documentElement.style;
  const glass = Math.round(window.screen?.height ?? 0);
  const avail = Math.round(window.screen?.availHeight ?? 0);

  /*
   * On a phone the cut rests at the bottom of the GLASS, not the bottom
   * of the first screen — Will: "for mobile, some extra notch space
   * should be added".
   *
   * screen.height is the whole display: status bar, notch, home
   * indicator and all. It is the furthest anything can possibly be from
   * the top of the page, so a cut resting there cannot surface in the
   * strip iOS paints behind its own floating bar, whatever that strip
   * turns out to measure. That was never usable before, because the
   * photograph ended at the hero's bottom edge and pushing the cut past
   * it only exposed page background. The artwork now reaches 103 points
   * below the hero (--portrait-extra), and the biggest gap measured on
   * Will's devices is 80, so the picture covers the whole allowance.
   *
   * availHeight first, on the devices where it reports something the
   * glass does not: it is the same quantity measured more precisely.
   * Four of Will's phones' properties return 0 or the full screen, so in
   * practice this is the glass.
   */
  if (FLOATING_CHROME.matches) {
    const bottom = avail > 0 && avail < glass && avail >= window.innerHeight ? avail : glass;
    if (bottom > 0) root.setProperty("--page-height", `${bottom}px`);
    else root.removeProperty("--page-height");
  } else {
    root.removeProperty("--page-height");
  }

  /* For scripts/viewport-probe.js only. Nothing in the CSS reads these. */
  root.setProperty("--screen-height", `${glass}px`);
  root.setProperty("--avail-height", `${avail}px`);
};

measurePage();
addEventListener("orientationchange", measurePage);

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
  if (!more) return;
  const progress = Math.min(1, Math.max(0, window.scrollY / travel()));
  if (Math.abs(progress - last) < 0.004 && progress !== 0 && progress !== 1) return;
  last = progress;
  /* On the section, NOT on :root. A custom property set on the root
     invalidates style for every element in the document, because custom
     properties inherit and the engine cannot know who read it. Setting
     it here keeps the recalculation to one subtree, which is the other
     half of why the tilt juddered. */
  more.style.setProperty("--cut-progress", progress.toFixed(4));
};

paintProgress();
addEventListener("scroll", paintProgress, { passive: true });
addEventListener("resize", () => { measurePage(); paintProgress(); });

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

/** Resolve a CSS length — var(), env(), svh, any of it — to pixels. */
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
  const boxTop = more.getBoundingClientRect().top + window.scrollY;
  // Plus the top inset, so the status bar is not sitting over the first
  // thing you were brought here to read. 0 where it is not reported,
  // which costs nothing: the cut is already clear by then.
  return Math.round(boxTop + resolve("var(--cut)") + resolve("env(safe-area-inset-top, 0px)"));
};

for (const cue of document.querySelectorAll('a[href="#more"]')) {
  cue.addEventListener("click", (event) => {
    if (!more) return;
    event.preventDefault();
    window.scrollTo({ top: landing(), behavior: REDUCED.matches ? "instant" : "smooth" });
    // Same lesson as toTop(): smooth is a request, not a promise.
    setTimeout(() => {
      if (Math.abs(window.scrollY - landing()) > 4) {
        window.scrollTo({ top: landing(), behavior: "instant" });
      }
    }, REDUCED.matches ? 0 : SCROLL_MS);
  });
}
