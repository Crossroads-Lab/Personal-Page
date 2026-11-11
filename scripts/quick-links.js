"use strict"

// --------------------------------------------------------------------------
// The four destinations, always visible
//
// They used to hide behind a chip labelled "Contact me", which was wrong
// twice over: contact is only one of the four, and a page whose whole
// purpose is to be linked from a business card should not make its links a
// second click. Then they hid behind a ⋮ menu, which was the same mistake
// wearing a different hat; the menu is gone and these are all that is left.
//
// Built from #destinations rather than written out again. That list is the
// one place the hrefs live, so changing the Calendly link in index.html
// changes it here too, and nothing can drift.
//
// TWO rows, because the page has two states and they want the icons in
// different places:
//
//   #quick-links         under the headline, inside #welcome. Wiped by the
//                        first question along with the rest of #welcome.
//   #quick-links-docked   above the input bar, inside the input container,
//                        which survives. Hidden by CSS until that happens.
//
// Both are generated from the same list in the same pass, so "two rows" is
// a layout fact and not a second copy of anything.
// --------------------------------------------------------------------------

const containers = [
  document.getElementById("quick-links"),
  document.getElementById("quick-links-docked"),
].filter(Boolean);
const destinations = document.getElementById("destinations");

/** Order matters: this is the order they appear in #destinations. */
const buildInto = (container) => {
  if (!container || !destinations) return;

  const entries = [...destinations.children].filter(el => el.querySelector("img"));

  container.replaceChildren(...entries.map((source) => {
    const isLink = source.tagName === "A";
    const node = document.createElement(isLink ? "a" : "button");
    node.className = "quick-link liquid-glass";

    // The list's own words are the accessible name — "View my LinkedIn",
    // not "LinkedIn" — so a screen reader and a tooltip both say the whole
    // thing, which a bare icon cannot.
    const label = (source.textContent || "").trim();
    node.title = label;
    node.setAttribute("aria-label", label);

    if (isLink) {
      node.href = source.href;
      node.target = source.target || "_blank";
      node.rel = "noopener";
    } else {
      node.type = "button";
      // Share is behaviour rather than a URL (navigator.share); forward to
      // the one implementation instead of copying it. If the browser has no
      // share support, chat-input-form.js hides the source entry — so hide
      // this one with it rather than offering a button that does nothing.
      if (source.style.display === "none") return null;
      node.onclick = (event) => { event.stopPropagation(); source.click(); };
    }

    const icon = source.querySelector("img");
    const copy = document.createElement("img");
    copy.src = icon.src;
    copy.alt = "";
    node.appendChild(copy);
    return node;
  }).filter(Boolean));
};

// After chat-input-form.js has had its say about navigator.share.
queueMicrotask(() => containers.forEach(buildInto));
