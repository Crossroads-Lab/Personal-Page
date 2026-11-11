"use strict"

import { toFragment } from "./markdown.js?v=3ba58513";

// --------------------------------------------------------------------------
// Cached DOM references (queried once for performance & clarity)
// --------------------------------------------------------------------------

export const content = document.getElementById("content");

let userScrolling = false, scrollTop = 0;

// When the user scroll, especially when the chat content is being generated.
content.addEventListener("scroll", () => {
  const totalHeight = content.scrollHeight;       // Total content height
  const scrolledFromTop = content.scrollTop;      // Pixels hidden at top
  const visibleHeight = content.clientHeight;     // Visible height of box

  // Distance remaining to the bottom
  const distanceToBottom = totalHeight - scrolledFromTop - visibleHeight;

  // Logic: "If less than 20px from bottom, do something"
  if (distanceToBottom < 20 && scrollTop <= scrolledFromTop) {
    userScrolling = false;
  } else if (scrollTop && scrollTop > scrolledFromTop ) {
    userScrolling = true;
  }

  // Update scrollTop.
  scrollTop = scrolledFromTop;
});

// When the chat content changes.
export const onContentchange = () => {
  const length = content.childNodes.length;
  if (length) {
    // Get the top.
    let node = content.childNodes[0];
    const start = node.offsetTop;

    // Get the bottom.
    node = content.childNodes[length - 1];
    const end = node.offsetTop + node.offsetHeight;

    // Get the maximum width.
    let width = 0;
    for (let i = 0; i !== length; ++i) {
      width = Math.max(width, content.childNodes[i].offsetWidth);
    }

    // Get the content inside size, and its percentage.
    const height = end - start, threshold = content.offsetHeight * 0.4;
    const windowWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
 
    // Blur background image if needed.
    if (height > threshold || (windowWidth < 1180 && width > Math.min(window.innerWidth - 500, 500))) {
      document.body.setAttribute("blured", "");
    } else {
      document.body.removeAttribute("blured");
    }

    // Smoothly scroll to the bottom
    userScrolling || content.scrollTo({
      top: content.scrollHeight,
      behavior: "smooth"
    });
  }
}

// Progressive text display.
//
// The text arrives as Markdown — a book title in *italics*, a list of
// awards, the Amazon link at the end of a book answer — so it is parsed and
// sanitized into a detached fragment first (scripts/markdown.js), then that
// fragment is revealed a character at a time.
//
// The tree is built into the live DOM lazily, in document order: an element
// appears just before its own text starts typing, never earlier. Attaching
// the whole skeleton up front would reserve the height of every empty
// paragraph before a word of it existed, and the answer would type into a
// block of pre-allocated whitespace instead of growing.
//
// `innerHTML` is still never handed the model's words. markdown.js rebuilds
// every tag from an allowlist before anything reaches a template, and what
// is appended here are nodes, not markup.
export const displayTextContent = (text, done, container = content, delay) => {
  const fragment = toFragment(text);
  userScrolling = false, scrollTop = 0;

  // Pacing is a property of how much there is to read, which is the words —
  // not the markup that got wrapped around them.
  const plain = fragment.textContent || "";
  (delay === undefined || delay === null) && (
    delay = Math.round(Math.max(200 - plain.length, 0) * 0.15 + 5)
  );

  // Every node of the parsed answer, in the order a reader meets them.
  const steps = [];
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) steps.push(node);

  // Source node -> the live node standing in for it. A text node's parent is
  // looked up here; the fragment's own children answer to `container`.
  const live = new Map();

  // The character loop is driven by setTimeout ALONE, and the layout/scroll
  // pass is coalesced to at most one per animation frame.
  //
  // It used to await a requestAnimationFrame between every character, so each
  // one cost a whole frame PLUS `delay` — which made the delay computed above
  // meaningless (a frame is ~16ms at 60fps, against a 5ms target) and tied
  // typing speed to the frame rate. Wherever rAF is throttled — a background
  // tab, low-power mode, an offscreen or de-prioritised view — it collapsed.
  // Measured in a throttled pane: rAF at 1fps, so the answer typed at one
  // character per second.
  //
  // Coalescing is also strictly less work than before: onContentchange reads
  // offsetTop/offsetHeight/offsetWidth and issues a smooth scrollTo, so
  // running it per character forced a synchronous layout per character.
  let framePending = false;
  const scheduleUpdate = () => {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      onContentchange();
    });
  };

  let index = 0, source = null, sink = null, cursor = 0, timeoutId, stopped = false;

  const breakTimeout = () => (stopped = true, clearTimeout(timeoutId));

  const f = () => {
    if (stopped) return;

    // Mid-word: keep typing into the text node already open.
    if (sink) {
      sink.data += source.data.charAt(cursor);
      scheduleUpdate();
      if (++cursor < source.data.length) {
        timeoutId = setTimeout(f, delay);
        return;
      }
      sink = null;
    }

    // Walk forward, materialising structure, until the next thing to type.
    while (index < steps.length) {
      const node = steps[index++];
      const parent = live.get(node.parentNode) || container;

      if (node.nodeType === Node.TEXT_NODE) {
        // Whitespace between blocks is layout, not reading. Typing it would
        // spend the delay on characters nobody can see.
        if (!node.data.trim()) {
          parent.appendChild(document.createTextNode(node.data));
          continue;
        }
        source = node;
        cursor = 0;
        sink = parent.appendChild(document.createTextNode(""));
        timeoutId = setTimeout(f, delay);
        return;
      }

      // cloneNode(false) rather than createElement: it carries the href,
      // target and rel that markdown.js has already vetted, and appendChild
      // adopts it out of the template's document.
      const element = node.cloneNode(false);
      parent.appendChild(element);
      live.set(node, element);
    }

    scheduleUpdate();
    stopped = true;
    typeof done === "function" && done();
  };

  f();
  return breakTimeout;
}
