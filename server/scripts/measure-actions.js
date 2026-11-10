"use strict";
/**
 * Where to put the threshold in server/server/actions.js.
 *
 *   npm --prefix server run measure-actions
 *
 * Prints the best score per destination for questions that SHOULD produce a
 * button and for questions that should not — including the near-misses that
 * decide the number, which are the ones that merely sound like they are
 * about a resume or a conversation.
 */
require("../config");
require("llms/src/xenova/env");
const { scoresFor, SIMILAR } = require("../server/actions");

const WANTED = [
  ["Can I see your resume?", "resume"],
  ["Do you have a CV?", "resume"],
  ["Where do I download your resume?", "resume"],
  ["send me your cv", "resume"],
  ["What's your LinkedIn?", "linkedin"],
  ["link me your linkedin profile", "linkedin"],
  ["Can we talk sometime?", "book"],
  ["I'd like to book 30 minutes", "book"],
  ["how can I reach you", "book"],
  ["Can I get in touch?", "book"],
  ["how do I share this page", "share"],
];

// Must NOT fire. The first group is plainly unrelated; the second is the
// dangerous group — questions that sound like the anchors but are asking
// about his history, not for a file or a meeting.
const UNWANTED = [
  "What did you do at Snap?",
  "What are your core values?",
  "How did you get into AI?",
  "Tell me about a project that failed",
  "What's the hardest technical decision you've made?",
  "What's on your resume for 2019?",
  "What roles has your resume covered?",
  "What do you look for when hiring?",
  "Tell me about your background",
  "Who have you worked with?",
  "What happened in that meeting?",
  "How do you run a one-on-one?",
];

const fmt = (s) => Object.entries(s).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v.toFixed(3)}`).join("  ");

(async () => {
  let misses = 0, falses = 0, lowestTrue = 1, highestFalse = 0;

  console.log(`\nSHOULD produce a button (threshold ${SIMILAR}):`);
  for (const [q, want] of WANTED) {
    const s = await scoresFor(q);
    const hit = s[want] >= SIMILAR;
    if (!hit) ++misses;
    lowestTrue = Math.min(lowestTrue, s[want]);
    console.log(`  ${hit ? "ok  " : "MISS"} ${s[want].toFixed(3)} ${want.padEnd(9)} ${q}`);
  }

  console.log(`\nShould produce NOTHING:`);
  for (const q of UNWANTED) {
    const s = await scoresFor(q);
    const top = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
    const fired = top[1] >= SIMILAR;
    if (fired) ++falses;
    highestFalse = Math.max(highestFalse, top[1]);
    console.log(`  ${fired ? "FALSE+" : "ok    "} ${fmt(s)}   ${q}`);
  }

  console.log(`\n${misses} missed, ${falses} false positives`);
  console.log(`lowest true ${lowestTrue.toFixed(3)}  |  highest false ${highestFalse.toFixed(3)}`);
  console.log(highestFalse < lowestTrue
    ? `clean separation — anything in (${highestFalse.toFixed(3)}, ${lowestTrue.toFixed(3)}) works`
    : `they overlap, so the threshold is a choice about which error to make`);
})();
