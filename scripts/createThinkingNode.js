"use strict"

// --------------------------------------------------------------------------
// The wait
//
// A question takes one to three seconds, and a spinner that says nothing is
// the longest three seconds on the page — there is no way to tell a slow
// answer from a broken one. So the wait reports itself, in the two ways that
// actually carry information: how long it has been, and what it is doing.
//
// NO ANIMATION. There was a pulsing dot and a light sweeping across the
// word, and both are gone. Will: "I don't like the thinking animation, maybe
// changing text with no animation like Claude is better." He is right, and
// the reason is that a sweep is motion that means nothing — it looks the
// same at one second and at thirty, so it cannot tell you the difference,
// which is the one thing the control exists to do. Text that changes is
// motion that means something: it only moves when the state has moved.
//
// The counter starts at 1s rather than 0s. A number that appears instantly
// and then sits at zero reads as stuck, which is the opposite of what it is
// for.
// --------------------------------------------------------------------------

/** Below this, the answer arrives before anyone wonders. */
const SHOW_ELAPSED_AFTER_MS = 1000;

/**
 * What it says, and when it starts saying it.
 *
 * Roughly tracking what is actually happening — the retrieval first, then
 * the writing — because a label that describes the real phases is worth
 * something and a random thesaurus of synonyms for "working" is not.
 *
 * The last one is the honest one. Past fifteen seconds something is wrong
 * or the question was very large, and "Still going…" says so without
 * claiming to know which.
 */
const PHASES = [
  { at:     0, text: "Thinking…" },
  { at:  2000, text: "Reading my notes…" },
  { at:  5000, text: "Finding the right part…" },
  { at:  9000, text: "Putting it together…" },
  { at: 15000, text: "Still going…" },
];

const phaseFor = (ms) => {
  let text = PHASES[0].text;
  for (const phase of PHASES) if (ms >= phase.at) text = phase.text;
  return text;
};

export const createThinkingNode = (text) => {
  // A caller that names its own label means it, so that one does not
  // rotate. Nothing passes one today; askAsChip and the form both leave it
  // to the phases.
  const fixed = typeof text === "string" && text.length > 0;

  const host = document.createElement("span");
  host.className = "thinking-loader";

  // The time comes FIRST, then the dot, then the words. Will: "have the
  // time before the text with a separating middle dot and spaces."
  //
  // Both the number and the separator are empty until there is a number to
  // show, so the row does not start with a bare dot hanging off its left.
  const elapsed = host.appendChild(document.createElement("span"));
  elapsed.className = "thinking-elapsed";

  const separator = host.appendChild(document.createElement("span"));
  separator.className = "thinking-separator";
  separator.setAttribute("aria-hidden", "true");

  const label = host.appendChild(document.createElement("span"));
  label.className = "thinking-label";
  label.textContent = fixed ? text : PHASES[0].text;

  const start = performance.now();

  // The node is thrown away by whoever clears #content, and nothing tells us
  // when. So the tick retires itself the moment it finds it is no longer in
  // the document — an interval left running against a detached node is how a
  // page ends up holding a tree it has already forgotten.
  const timer = setInterval(() => {
    if (!host.isConnected) return clearInterval(timer);
    const ms = performance.now() - start;

    if (ms >= SHOW_ELAPSED_AFTER_MS) {
      const seconds = `${Math.floor(ms / 1000)}s`;
      // Only write when the value has actually changed. The tick is four
      // times a second and the number changes once a second, so three
      // writes in four would be the same string — and a text write is a
      // layout invalidation whether or not anything differs.
      if (elapsed.textContent !== seconds) elapsed.textContent = seconds;
      if (!separator.textContent) separator.textContent = " · ";
    }

    if (fixed) return;
    const next = phaseFor(ms);
    if (label.textContent !== next) label.textContent = next;
  }, 250);

  return host;
};
