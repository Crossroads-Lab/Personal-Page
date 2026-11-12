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
  // actually starts inside it, and the two are half a slope apart.
  // Reading the box made the probe report an 87px leak on a screen with
  // no dark on it at all.
  // Measure the clipped edge, which is the thing with a colour.
  const clipTop = more
    ? parseFloat((getComputedStyle(more).clipPath.match(/([\d.]+)px/g) || [])[1] ?? 0)
    : 0;
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
