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
// which is the one thing the control exists to do.
//
// The words no longer claim to describe the real phases either. They did
// for one commit — "Reading my notes…", "Finding the right part…" — which
// sounds better and was a small lie: nothing here knows whether retrieval
// has finished. The number is the honest signal and it is doing that job
// alone; the words are there to show the page is alive.
//
// The counter starts at 1s rather than 0s. A number that appears instantly
// and then sits at zero reads as stuck, which is the opposite of what it is
// for.
// --------------------------------------------------------------------------

/** Below this, the answer arrives before anyone wonders. */
const SHOW_ELAPSED_AFTER_MS = 1000;

/**
 * Claude's own list, which is what Will asked for: "for the think texts,
 * just re-use Claude's list."
 *
 * Reproduced from Claude Code's interface rather than copied from a file
 * — so it is close but not guaranteed exhaustive, and the order here is
 * alphabetical rather than whatever Claude's is.
 *
 * Two deliberate omissions. "Clauding" is Anthropic's own joke about
 * itself and would be a non-sequitur on a page about Will. Anything that
 * reads as an error rather than as work is out for the same reason.
 *
 * Some of these are whimsical and that is the point of the list — but
 * this page is read by recruiters, so if "Honking" or "Schlepping" ever
 * reads wrong here, cutting a line from this array is the whole edit.
 */
const WORDS = [
  "Accomplishing", "Actioning", "Baking", "Brewing", "Calculating",
  "Cerebrating", "Churning", "Coalescing", "Cogitating", "Computing",
  "Conjuring", "Considering", "Cooking", "Crafting", "Creating",
  "Crunching", "Deliberating", "Determining", "Doing", "Effecting",
  "Finagling", "Forging", "Forming", "Generating", "Hatching", "Herding",
  "Honking", "Hustling", "Ideating", "Inferring", "Manifesting",
  "Marinating", "Moseying", "Mulling", "Mustering", "Musing", "Noodling",
  "Percolating", "Pondering", "Processing", "Puttering", "Reticulating",
  "Ruminating", "Schlepping", "Shucking", "Simmering", "Smooshing",
  "Spinning", "Stewing", "Synthesizing", "Thinking", "Transmuting",
  "Vibing", "Working",
];

/** How long each word holds before the next one. */
const WORD_MS = 3000;

/*
 * The FIRST word is always "Thinking…", and the rest are random.
 *
 * Claude starts on a random one. This does not, because the first word is
 * the one a stranger sees on their first question and a coin-flip between
 * "Thinking" and "Schlepping" is a bad trade for a page someone is being
 * assessed on. After that, the rotation is the whole charm of the list.
 */
const wordAt = (index, bag) => (index === 0 ? "Thinking" : bag[(index - 1) % bag.length]);

/** Fisher-Yates, so the sequence differs per question rather than per load. */
const shuffled = () => {
  const bag = WORDS.filter(w => w !== "Thinking");
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
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
  /* The mark goes first, and it is the only part of this row that moves on
     its own. Three chips filling left to right: what the backend is doing
     while you wait is a lookup across the corpus, so the mark is three
     sections lighting up rather than a wheel going round.
     
     aria-hidden because the label beside it already announces "Thinking…";
     a screen reader gains nothing from a decorative pulse, and the CSS
     removes it entirely for anyone who asked for less motion. */
  const spinner = host.appendChild(document.createElement("span"));
  spinner.className = "thinking-spinner";
  spinner.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) spinner.appendChild(document.createElement("i"));

  const elapsed = host.appendChild(document.createElement("span"));
  elapsed.className = "thinking-elapsed";

  const separator = host.appendChild(document.createElement("span"));
  separator.className = "thinking-separator";
  separator.setAttribute("aria-hidden", "true");

  const label = host.appendChild(document.createElement("span"));
  label.className = "thinking-label";
  label.textContent = fixed ? text : `${wordAt(0)}…`;

  const bag = shuffled();
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
    const next = `${wordAt(Math.floor(ms / WORD_MS), bag)}…`;
    if (label.textContent !== next) label.textContent = next;
  }, 250);

  return host;
};
