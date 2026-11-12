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
// Delete it once the first screen has been right on a real phone for a
// while.
// --------------------------------------------------------------------------

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
  const ends = (getComputedStyle(more ?? document.body).clipPath.match(/([\d.]+)px/g) || [])
    .slice(1, 3)
    .map(parseFloat);
  const clipTop = more && ends.length ? Math.min(...ends) : 0;
  const leak = moreRect
    ? Math.round(window.innerHeight - (moreRect.top + clipTop))
    : null;

  return [
    ["screen.height", Math.round(window.screen?.height ?? 0)],
    ["innerHeight", window.innerHeight],
    ["visualViewport", Math.round(window.visualViewport?.height ?? 0)],
    ["100svh", px("100svh")],
    ["100lvh", px("100lvh")],
    ["100dvh", px("100dvh")],
    ["safe-area-bottom", px("env(safe-area-inset-bottom, 0px)")],
    ["safe-area-top", px("env(safe-area-inset-top, 0px)")],
    // The number the whole resting position now turns on. If this comes
    // back 0 on a phone, window.screenY is not reporting and --cut-rest
    // falls back to resting too low rather than too high.
    ["window.screenY", Math.round(window.screenY ?? 0)],
    ["--viewport-top", px("var(--viewport-top)")],
    // Where the bottom edge of the glass is, in page coordinates. The
    // cut at rest should be sitting exactly here.
    ["glass bottom, in viewport", Math.round((window.screen?.height ?? 0) - (window.screenY ?? 0))],
    ["--chrome-slack", px("var(--chrome-slack)")],
    ["--hero-height", px("var(--hero-height)")],
    ["--cut-rest", px("var(--cut-rest)")],
    ["--cut-progress", getComputedStyle(more ?? document.body).getPropertyValue("--cut-progress").trim() || "0"],
    ["hero bottom", heroRect ? Math.round(heroRect.bottom) : "?"],
    ["bar bottom", bar ? Math.round(bar.getBoundingClientRect().bottom) : "?"],
    ["#more top", moreRect ? Math.round(moreRect.top) : "?"],
    ["dark edge, in viewport", moreRect ? Math.round(moreRect.top + clipTop) : "?"],
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
