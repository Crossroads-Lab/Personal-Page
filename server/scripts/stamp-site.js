"use strict";
/**
 * Version-stamp the site's CSS and JS links, so a deploy is visible at once.
 *
 *   npm --prefix server run stamp
 *
 * GitHub Pages serves everything with `cache-control: max-age=600`. A
 * browser that loaded the page before a deploy therefore keeps the OLD
 * stylesheet for up to ten minutes — the HTML revalidates on reload, the
 * stylesheet does not. The page looks unchanged, and the obvious conclusion
 * is that the change was never made. That cost real time on 2026-11-10:
 * production had the new CSS, the browser had the old one, and both of us
 * were looking at a layout that had already been fixed.
 *
 * The stamp is a hash of the file's own contents, not the commit SHA. A SHA
 * would be circular — stamping changes index.html, which changes the commit
 * — and it would also bust the cache on every deploy whether or not the
 * asset moved. A content hash changes exactly when the file does.
 *
 * Run it after touching anything under css/ or scripts/, before committing.
 * Running it when nothing changed is a no-op and says so.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const HTML = path.join(ROOT, "index.html");

/** 8 hex characters: collision-proof enough for cache keys on one site. */
const stampFor = (file) => crypto
  .createHash("sha256")
  .update(fs.readFileSync(file))
  .digest("hex")
  .slice(0, 8);

/**
 * Stamp every local reference INSIDE css/ and scripts/ before the HTML.
 *
 * index.html points at two files, but each pulls in others the browser
 * fetches and caches on its own: css/index.css @imports common.css and
 * chat-input.css, and scripts/index.js imports the modules that do the
 * actual work. Stamping only the two entry points busts nothing that
 * matters — the layout and the behaviour both live one level down.
 *
 * A dependency's hash changes its dependant's contents, which changes that
 * file's hash, so this runs to a fixed point rather than in one pass. The
 * graph is small and acyclic; the cap is there so a cycle produces a
 * complaint instead of a hung build.
 */
const LOCAL_REF = [
  // @import "./common.css"
  /(@import\s+")(\.\/[^"?]+\.css)(\?v=[0-9a-f]+)?(")/g,
  // import "./x.js"  /  from "./x.js"
  /((?:^|\s)(?:import|from)\s+")(\.\/[^"?]+\.js)(\?v=[0-9a-f]+)?(")/gm,
];

const sourceFiles = () => ["css", "scripts"].flatMap((dir) => {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(f => /\.(css|js)$/.test(f))
    .map(f => path.join(abs, f));
});

const stampDependencies = () => {
  const files = sourceFiles();
  const MAX_PASSES = 10;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      let next = text;

      for (const pattern of LOCAL_REF) {
        next = next.replace(pattern, (whole, lead, rel, _old, tail) => {
          const target = path.join(path.dirname(file), rel);
          if (!fs.existsSync(target)) return whole;
          return `${lead}${rel}?v=${stampFor(target)}${tail}`;
        });
      }

      if (next !== text) {
        fs.writeFileSync(file, next);
        changed = true;
      }
    }

    if (!changed) return pass;
  }

  console.warn(`  stopped after ${MAX_PASSES} passes — is there an import cycle?`);
  return MAX_PASSES;
};

const main = () => {
  const passes = stampDependencies();
  if (passes) console.log(`Stamped local imports (${passes} pass(es)).`);
  let html = fs.readFileSync(HTML, "utf8");
  const before = html;
  const touched = [];

  // Local css/… and scripts/… references only. Anything absolute belongs to
  // somebody else's cache policy and is none of our business.
  html = html.replace(
    /((?:href|src)=")((?:css|scripts)\/[^"?]+)(\?v=[0-9a-f]+)?(")/g,
    (_m, lead, rel, _old, tail) => {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) {
        console.warn(`  missing, left alone: ${rel}`);
        return `${lead}${rel}${_old || ""}${tail}`;
      }
      const stamp = stampFor(file);
      touched.push(`${rel}?v=${stamp}`);
      return `${lead}${rel}?v=${stamp}${tail}`;
    },
  );

  if (html === before) {
    console.log("Already current — nothing to stamp.");
    return;
  }

  fs.writeFileSync(HTML, html);
  console.log(`Stamped ${touched.length} reference(s) in index.html:`);
  for (const t of touched) console.log(`  ${t}`);
};

main();
