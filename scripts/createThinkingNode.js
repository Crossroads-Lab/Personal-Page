"use strict"

// --------------------------------------------------------------------------
// The wait
//
// A question takes one to three seconds, and a spinner that says nothing is
// the longest three seconds on the page — there is no way to tell a slow
// answer from a broken one. So the wait reports itself: the label shimmers
// while it works, and once past a second it says how long it has been.
//
// The counter starts at 1s rather than 0s. A number that appears instantly
// and then sits at zero reads as stuck, which is the opposite of what it is
// for.
// --------------------------------------------------------------------------

/** Below this, the answer arrives before anyone wonders. */
const SHOW_ELAPSED_AFTER_MS = 1000;

export const createThinkingNode = (text = "Thinking…") => {
  const host = document.createElement("span");
  host.className = "thinking-loader";

  const dot = host.appendChild(document.createElement("b"));
  dot.textContent = "●";

  const label = host.appendChild(document.createElement("span"));
  label.className = "thinking-label";
  label.textContent = text;

  const elapsed = host.appendChild(document.createElement("span"));
  elapsed.className = "thinking-elapsed";

  const start = performance.now();

  // The node is thrown away by whoever clears #content, and nothing tells us
  // when. So the tick retires itself the moment it finds it is no longer in
  // the document — an interval left running against a detached node is how a
  // page ends up holding a tree it has already forgotten.
  const timer = setInterval(() => {
    if (!host.isConnected) return clearInterval(timer);
    const ms = performance.now() - start;
    if (ms < SHOW_ELAPSED_AFTER_MS) return;
    elapsed.textContent = `${Math.floor(ms / 1000)}s`;
  }, 250);

  return host;
};
