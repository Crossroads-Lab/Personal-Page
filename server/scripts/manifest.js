"use strict";

/**
 * Corpus manifest: documentId -> sha256 of the markdown the .bin was built from.
 *
 * Why this exists. A .bin stores section ranges as byte offsets into its source
 * markdown; SectionResolver reads that markdown live at query time. Edit the
 * markdown without re-ingesting and the offsets silently point at the wrong
 * bytes — the resolver only returns null when a range overshoots the file
 * length, so a merely shifted range returns plausible-looking garbage.
 *
 * Observed consequence: a header rewrite shifted every offset, section text was
 * severed mid-sentence, and the model invented employment dates to bridge the
 * gap. No error anywhere in the stack.
 *
 * Written by ingest, verified at engine boot.
 */

const fs     = require("fs").promises;
const path   = require("path");
const crypto = require("crypto");

const CONFIG           = require("../config");
const deriveDocumentId = require("llms/src/utilities/deriveDocumentId");

const MANIFEST_PATH = path.join(CONFIG.DATASET, "manifest.json");

const sha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

const walk = async (dir) => {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
};

/** Build the manifest from what's on disk right now. */
const build = async () => {
  const files = await walk(CONFIG.MARKDOWNS);
  const documents = {};
  for (const file of files) {
    documents[deriveDocumentId(file)] = sha256(await fs.readFile(file, "utf8"));
  }
  return { generatedAt: new Date().toISOString(), documents };
};

const write = async () => {
  const manifest = await build();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
};

/**
 * Compare on-disk markdown against the manifest.
 * @returns {Promise<{ok: boolean, reason?: string, stale: string[], missing: string[], untracked: string[]}>}
 */
const verify = async () => {
  let recorded;
  try {
    recorded = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8")).documents;
  } catch {
    return { ok: false, reason: "no manifest", stale: [], missing: [], untracked: [] };
  }

  const current = (await build()).documents;
  const stale     = [];  // markdown changed since the .bin was built
  const missing   = [];  // manifest knows it, markdown is gone
  const untracked = [];  // markdown exists, never ingested

  for (const [id, hash] of Object.entries(recorded)) {
    if (!(id in current)) missing.push(id);
    else if (current[id] !== hash) stale.push(id);
  }
  for (const id of Object.keys(current)) {
    if (!(id in recorded)) untracked.push(id);
  }

  return {
    ok: stale.length === 0 && missing.length === 0 && untracked.length === 0,
    stale, missing, untracked,
  };
};

module.exports = Object.freeze({ build, write, verify, MANIFEST_PATH });

// Run directly: `node scripts/manifest.js` writes, `--verify` checks.
if (require.main === module) {
  (async () => {
    if (process.argv.includes("--verify")) {
      const r = await verify();
      if (r.ok) return console.log("corpus manifest: OK — bins match markdown");
      console.error("corpus manifest: MISMATCH");
      if (r.reason)            console.error(`  ${r.reason}`);
      for (const id of r.stale)     console.error(`  stale (markdown edited since ingest): ${id}`);
      for (const id of r.missing)   console.error(`  missing markdown: ${id}`);
      for (const id of r.untracked) console.error(`  never ingested: ${id}`);
      console.error("\n  Run: npm run ingest");
      process.exit(1);
    }
    const m = await write();
    console.log(`corpus manifest written — ${Object.keys(m.documents).length} documents`);
  })();
}
