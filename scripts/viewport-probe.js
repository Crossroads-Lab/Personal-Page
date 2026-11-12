"use strict"

// --------------------------------------------------------------------------
// What the viewport actually is, on the device it actually is.
//
// Load with ?viewport on the end of the URL. Nothing imports this
// otherwise — scripts/index.js only reaches for it when the parameter is
// there, so it costs a request that is never made.
//
// It exists because the diagonal cut kept appearing at the bottom of the
// first screen on an iPhone and could not be reproduced in any browser I
// can see. Three fixes were written against three different guesses about
// which number was wrong. This prints all of them instead.
//
// ?viewport2 is the same panel with the whole second section taken out
// of the document. Nothing below the hero, nothing pointing at it: the
// first screen on its own, so what is at the bottom of the glass is the
// page's own background and not the cut. If something dark still shows
// down there in this mode, it was never the cut.
//
// Delete both once the first screen has been right on a real phone for a
// while.
// --------------------------------------------------------------------------

/*
 * ?viewport2 — hide everything below the fold.
 *
 * display: none rather than visibility or a colour, so the section is not
 * laid out at all and cannot paint anywhere, including in the strip below
 * the layout viewport that started this whole thread.
 *
 * The two cues go with it. They are first-screen furniture, not second-
 * section content, but a chevron pointing at a section that is not there
 * is its own kind of misleading.
 */
const SOLO = location.search.includes("viewport2");

if (SOLO) {
  const hide = document.createElement("style");
  hide.textContent =
    "#more, .chip--more, .more-chevron { display: none !important; }";
  document.head.appendChild(hide);
}

const px = (value) => {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:${value}`;
  document.body.appendChild(probe);
  const resolved = parseFloat(getComputedStyle(probe).height);
  probe.remove();
  return Math.round(resolved);
};

const render = () => {
  const hero = document.querySelector(".hero");
  const more = document.getElementById("more");
  const bar = document.getElementById("chat-input-container");
  const heroRect = hero?.getBoundingClientRect();
  const moreRect = more?.getBoundingClientRect();

  // The question the whole thing turns on: is the DARK above the bottom of
  // what the visitor can see?
  //
  // Not the section's box top — the clip path decides where the dark
  // actually starts inside it, and the two are a whole slope apart.
  // Reading the box made the probe report an 87px leak on a screen with
  // no dark on it at all.
  //
  // Both ends, then the higher of the two: the line is hinged at the
  // left and swings its right end up, so the first dark pixel to cross
  // the fold is the right one. Taking the left end alone would miss a
  // leak by the full --cut.
  // In ?viewport2 the section is display:none, so its rect is all zeros
  // and its clip path is "none". Reading them would print a confident
  // row of nonsense, so every cut row says so instead.
  const shown = !!more && !!moreRect?.height;

  const ends = (getComputedStyle(more ?? document.body).clipPath.match(/([\d.]+)px/g) || [])
    .slice(1, 3)
    .map(parseFloat);
  const [leftEnd = 0] = ends;
  const clipTop = shown && ends.length ? Math.min(...ends) : 0;
  const leak = shown
    ? Math.round(window.innerHeight - (moreRect.top + clipTop))
    : "(no section)";

  // The two candidate edges, printed side by side, because this is the
  // argument the whole cut has been about.
  //
  //   page bottom   100lvh. The last row of pixels the page is ever
  //                 given. The hinge rests here.
  //   glass bottom  the display, less the status bar above the page.
  //                 61 points lower on Will's phone, and every one of
  //                 them is Safari's own bar — nothing can be drawn on
  //                 them, which is the whole reason the hinge does not
  //                 aim there.
  //
  // If safe-area-top reads 0 the second number is meaningless and says
  // so by being 120 too low, which is also the answer to whether the
  // safe-area variables could have rescued the screen.height sums.
  const safeTop = px("env(safe-area-inset-top, 0px)");
  const pageHeight = getComputedStyle(document.documentElement)
    .getPropertyValue("--page-height").trim();
  const pageBottom = pageHeight ? parseFloat(pageHeight) : px("100lvh");
  const glassBottom = Math.round((window.screen?.height ?? 0) - safeTop);

  return [
    ["screen.height", Math.round(window.screen?.height ?? 0)],
    ["screen.availHeight", Math.round(window.screen?.availHeight ?? 0)],
    ["innerHeight", window.innerHeight],
    ["visualViewport", Math.round(window.visualViewport?.height ?? 0)],
    ["100svh", px("100svh")],
    ["100lvh", px("100lvh")],
    ["100dvh", px("100dvh")],
    ["safe-area-bottom", px("env(safe-area-inset-bottom, 0px)")],
    ["safe-area-top", safeTop],
    // Kept only as evidence for why the glass is not what the cut aims
    // at: screen.height runs well past 100lvh, and the difference is
    // split between the status bar above the page and Safari's bar
    // below it, neither of which the page can paint on.
    ["window.screenY", Math.round(window.screenY ?? 0)],
    ["--chrome-slack", px("var(--chrome-slack)")],
    ["--hero-height", px("var(--hero-height)")],
    // NOT px("var(--cut-rest)") — it is negative now, and a probe div
    // clamps a negative height to 0, which would print a reassuring lie.
    // The hinge is the left end of the clip path and it does not move,
    // so where it sits IS the resting position. It should equal 100lvh.
    ["--page-height", pageHeight || "unset -> 100lvh"],
    ["page bottom (used)", pageBottom],
    ["glass bottom (safe)", glassBottom],
    ["cut hinge, page y", shown ? Math.round(moreRect.top + scrollY + leftEnd) : "(no section)"],
    ["hinge - page bottom", shown ? Math.round(moreRect.top + scrollY + leftEnd) - pageBottom : "(no section)"],
    ["--cut-progress", getComputedStyle(more ?? document.body).getPropertyValue("--cut-progress").trim() || "0"],
    ["hero bottom", heroRect ? Math.round(heroRect.bottom) : "?"],
    ["bar bottom", bar ? Math.round(bar.getBoundingClientRect().bottom) : "?"],
    ["#more top", shown ? Math.round(moreRect.top) : "(no section)"],
    ["dark edge, in viewport", shown ? Math.round(moreRect.top + clipTop) : "(no section)"],
    ["LEAK (>0 is the bug)", leak],
    ["scrollY", Math.round(window.scrollY)],
  ];
};

const panel = document.createElement("div");
panel.style.cssText = [
  "position:fixed", "left:8px", "top:8px", "z-index:2147483647",
  "background:rgba(0,0,0,.86)", "color:#fff", "padding:10px 12px",
  "border-radius:10px", "font:11px/1.5 ui-monospace,Menlo,monospace",
  "pointer-events:none", "white-space:pre", "max-width:70vw",
].join(";");
document.body.appendChild(panel);

const paint = () => {
  panel.textContent = render()
    .map(([k, v]) => `${k.padEnd(22)} ${v}`)
    .join("\n");
};

paint();
addEventListener("scroll", paint, { passive: true });
addEventListener("resize", paint);
window.visualViewport?.addEventListener("resize", paint);
window.visualViewport?.addEventListener("scroll", paint);

/*
 * And again, repeatedly, for the first couple of seconds.
 *
 * The one paint at import time was a lie on any page that was then left
 * alone. This module runs while <body loading> is still set, before the
 * fonts have swapped and before the portrait has decided how tall it is:
 * caught it printing "hero bottom 32" on a hero that measured 812 a
 * moment later, and "bar bottom 112" on a bar at 796. Every row was
 * exactly 780 out, and nothing would have corrected them until the page
 * was scrolled or turned. A probe that has to be nudged before it tells
 * the truth is worse than no probe, because its numbers look as
 * confident as the right ones.
 *
 * Bounded rather than an interval: eight repaints over two seconds, then
 * it goes quiet and the event listeners above take over. A permanent
 * timer would keep forcing layout four times a second, on the one page
 * where we care how the scrolling feels.
 */
let settling = 0;
const settle = setInterval(() => {
  paint();
  if (++settling >= 8) clearInterval(settle);
}, 250);

addEventListener("load", paint);
document.fonts?.ready.then(paint);
