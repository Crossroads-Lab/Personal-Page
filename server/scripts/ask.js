"use strict";

/**
 * CLI demo.
 *
 *   npm run ask -- "what did you do at Snap?"     # one-shot
 *   npm run ask                                    # interactive REPL
 */

const readline  = require("readline");
const getEngine = require("../server/engine");

// Chunks arrive with inconsistent leading whitespace, so concatenating them
// naively yields "next hire.Another one:". Insert a space only where neither
// side already supplies one.
const flatten = (result) => (result.answer || [])
  .map(c => c.text || "")
  .filter(Boolean)
  .reduce((acc, next) =>
    !acc                            ? next
    : /\s$/.test(acc) || /^\s/.test(next) ? acc + next
    : acc + " " + next, "")
  .trim();

const render = (result) => {
  console.log("\n" + flatten(result) + "\n");

  const sources = [...new Set(
    (result.answer || []).filter(c => c.source).map(c => c.source.documentId)
  )];
  if (sources.length) console.log("  sources: " + sources.join(", "));

  if (result.followUpQuestions?.length) {
    console.log("  follow-ups:");
    for (const q of result.followUpQuestions) console.log("    · " + q);
  }

  const cost = result.stats?.collapse?.();
  if (cost) {
    const c = typeof cost.cost === "function" ? cost.cost() : null;
    console.log(`  intent: ${result.user_intent || "—"}`);
    if (c) {
      console.log(`  ${cost.inputTokens || 0} in / ${cost.outputTokens || 0} out · $${(c.total || 0).toFixed(5)}`);
    }
  }
  console.log();
};

const main = async () => {
  const oneShot = process.argv.slice(2).join(" ").trim();
  const { ask } = await getEngine();

  if (oneShot) {
    render(await ask(oneShot));
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Interactive mode. Ctrl-C to exit.\n');

  const loop = () => rl.question("you › ", async (line) => {
    const q = line.trim();
    if (!q) return loop();
    try {
      render(await ask(q));
    } catch (err) {
      console.error("  error:", err.message, "\n");
    }
    loop();
  });
  loop();
};

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
