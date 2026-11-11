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
 * Stamp the @import chain first.
 *
 * index.html references one stylesheet, but css/index.css pulls in three
 * more with @import, and the browser fetches and caches each of those
 * separately. Stamping only the entry point therefore busts nothing that
 * matters — common.css and chat-input.css are where the layout lives. They
 * have to be stamped first, because doing so changes index.css, which
 * changes the hash the HTML needs to carry.
 */
const stampImports = () => {
  const entry = path.join(ROOT, "css/index.css");
  if (!fs.existsSync(entry)) return;
  const css = fs.readFileSync(entry, "utf8");
  const next = css.replace(
    /(@import\s+")(\.\/[^"?]+\.css)(\?v=[0-9a-f]+)?(")/g,
    (_m, lead, rel, _old, tail) => {
      const file = path.join(ROOT, "css", rel.replace(/^\.\//, ""));
      if (!fs.existsSync(file)) return `${lead}${rel}${_old || ""}${tail}`;
      return `${lead}${rel}?v=${stampFor(file)}${tail}`;
    },
  );
  if (next !== css) {
    fs.writeFileSync(entry, next);
    console.log("Stamped the @import chain in css/index.css.");
  }
};

const main = () => {
  stampImports();
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
