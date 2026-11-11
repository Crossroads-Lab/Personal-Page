"use strict"

// --------------------------------------------------------------------------
// The four destinations, always visible
//
// They used to hide behind a chip labelled "Contact me", which was wrong
// twice over: contact is only one of the four, and a page whose whole
// purpose is to be linked from a business card should not make its links a
// second click.
//
// Built from the ⋮ menu rather than written out again. That menu is the one
// place the hrefs live, so changing the Calendly link in index.html changes
// it here too, and nothing can drift. The menu stays for the conversation
// view, where there is no room for a row of icons.
// --------------------------------------------------------------------------

const container = document.getElementById("quick-links");
const menu = document.getElementById("chat-menu");

/** Order matters: this is the order they appear in the menu. */
const build = () => {
  if (!container || !menu) return;

  const entries = [...menu.children].filter(el => el.querySelector("img"));

  container.replaceChildren(...entries.map((source) => {
    const isLink = source.tagName === "A";
    const node = document.createElement(isLink ? "a" : "button");
    node.className = "quick-link liquid-glass";

    // The menu's own words are the accessible name — "View my LinkedIn",
    // not "LinkedIn" — so a screen reader and a tooltip say the same thing
    // the menu would have said.
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
      // share support, chat-input-form.js hides the menu entry — so hide
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
queueMicrotask(build);
