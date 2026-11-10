"use strict";

/**
 * One line per question, so a bad answer can be explained after the fact.
 *
 * Until now the only record of a query was the Anthropic bill. When a chip
 * produced an answer that missed — "what was the PhD in" coming back with
 * the story of how the PhD happened — there was nothing to look at: not the
 * question, not what was retrieved, not which chip it came from.
 *
 * What is written, and what is not:
 *
 *   - The question, the documents the answer actually cited, the intent the
 *     classifier assigned, the follow-ups offered, the buttons shown, and
 *     how long it took. That set is chosen to answer one question — "why did
 *     it say that" — and the cited documentIds are the part that does it,
 *     because a wrong answer is nearly always a retrieval miss.
 *   - NOT the IP. The rate limiter needs one in memory and that is a
 *     different thing from writing it down next to what someone asked. The
 *     questions alone are not identifying; questions plus address are.
 *   - NOT the answer text. It is reconstructible from the sources and it
 *     would multiply the size of the file by twenty.
 *
 * Two sinks, on purpose. stdout is the real one: under systemd it lands in
 * the journal, which already handles rotation, retention and disk pressure,
 * and it is there whether or not a path is configured. The file is for
 * reading without root and for keeping a longer tail than the journal is
 * configured to hold.
 */

const fs = require("fs");
const path = require("path");

/** Rotate at 8 MB. At ~300 bytes a line that is tens of thousands of
 *  questions, which on a personal page is years, and it bounds the disk at
 *  16 MB across the two files on an 8 GB volume. */
const MAX_BYTES = 8 * 1024 * 1024;

let stream = null;
let streamPath = null;
let written = 0;
let warned = false;

const open = (file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  written = fs.existsSync(file) ? fs.statSync(file).size : 0;
  stream = fs.createWriteStream(file, { flags: "a" });
  // A failing log must never take the service with it.
  stream.on("error", (err) => {
    if (!warned) {
      console.error(`query log (${file}) is not writable: ${err.message}`);
      warned = true;
    }
    stream = null;
  });
  streamPath = file;
};

/** Keep one previous file. Older than that is not worth the disk. */
const rotate = () => {
  const file = streamPath;
  try {
    stream?.end();
    fs.renameSync(file, `${file}.1`);
  } catch { /* if rotation fails, reopening appends — better than throwing */ }
  open(file);
};

/**
 * @param {object} entry  already-shaped record; see app.js for the fields
 * @param {string|null} file  CONFIG.QUERY_LOG
 *
 * Never throws. A log that can break a request is worse than no log.
 */
const logQuery = (entry, file) => {
  let line;
  try {
    line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  } catch {
    return;
  }

  // stdout first, and unconditionally: this is the sink that always exists.
  console.log(line);

  if (!file) return;
  try {
    if (!stream || streamPath !== file) open(file);
    if (written >= MAX_BYTES) rotate();
    stream?.write(line + "\n");
    written += line.length + 1;
  } catch (err) {
    if (!warned) {
      console.error(`query log: ${err.message}`);
      warned = true;
    }
  }
};

module.exports = { logQuery, MAX_BYTES };
