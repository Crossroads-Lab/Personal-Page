"use strict"

// --------------------------------------------------------------------------
// Drop a questionnaire, get it back answered
//
// A recruiter's screening questions arrive as a file. Typing twenty of them
// into a chat box one at a time is the kind of friction that ends with the
// page closed, so: drop the file anywhere on the window, and the same file
// comes back with the answers written in.
//
// ── Why this runs in the browser ────────────────────────────────────────
//
// The obvious design is an upload endpoint. This does not have one, and
// deliberately: server/app.js says "no database, no auth, no upload
// endpoints — this serves one public corpus", and that sentence is most of
// its security posture. Parsing here keeps it true. It also means a
// recruiter's questionnaire — which can name the company, the role, and the
// other candidates — never leaves their machine. Only the questions travel,
// through the same endpoint anyone can type into.
//
// The cost is parser libraries, and they are not small. So none of them
// load until a file is actually dropped, and then only the one that format
// needs. Someone who never drops anything pays nothing, which is nearly
// everyone.
//
// ── Desktop only ────────────────────────────────────────────────────────
//
// Gated on width, matching the chip row: there is no dragging a file onto a
// phone. Below the breakpoint this module binds nothing at all.
// --------------------------------------------------------------------------

import { API_BASE } from "./api.js?v=01b9ad0a";

/** Past this, the rest come back listed as unanswered rather than charged for. */
const MAX_QUESTIONS = 20;

/** Same gate as the chip row — the behaviour follows the width, not the device. */
const DESKTOP = "(min-width: 768px)";

/**
 * Parsers, by extension. Loaded on demand, pinned, never at page load.
 *
 * Each returns plain text; finding the questions in it is one job, done
 * once, below. A format this does not know is refused by name rather than
 * parsed into nonsense.
 */
const READERS = {
  txt:  async (file) => file.text(),
  md:   async (file) => file.text(),
  csv:  async (file) => file.text(),

  docx: async (file) => {
    const mammoth = await import("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  },

  xlsx: async (file) => {
    const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    // Every sheet, every cell, one per line: a questionnaire in a
    // spreadsheet puts one question per row, and which column it sits in is
    // not worth guessing at.
    return book.SheetNames
      .map(name => XLSX.utils.sheet_to_csv(book.Sheets[name]))
      .join("\n");
  },

  pdf: async (file) => {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/+esm");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; ++i) {
      const content = await (await doc.getPage(i)).getTextContent();
      // Rebuild lines from the y positions: a PDF has no lines, only items
      // at coordinates, and a question split across two of them is not a
      // question any more.
      const rows = new Map();
      for (const item of content.items) {
        const y = Math.round(item.transform[5]);
        rows.set(y, (rows.get(y) || "") + item.str);
      }
      pages.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, s]) => s).join("\n"));
    }
    return pages.join("\n");
  },
};

const extensionOf = (name) => (name.split(".").pop() || "").toLowerCase();

/**
 * The questions in a document.
 *
 * Three shapes, because a questionnaire is written by a person and arrives
 * in whichever one they reached for: a line ending in a question mark, a
 * numbered or bulleted item, or a cell in a spreadsheet row. Anything that
 * is none of those is prose around the questions — a covering note, a
 * header, a footer — and is left alone.
 *
 * Deliberately generous about what counts and strict about what is kept:
 * a false positive costs one answer nobody asked for, a false negative
 * silently drops a question the person wanted answered.
 */
const ASKS = /^(?:tell me|describe|explain|walk (?:me )?through|give (?:me )?(?:an? )?example|share (?:an? )?example|talk (?:to me )?about|outline|summari[sz]e)\b/i;

const questionsIn = (text, { tabular = false } = {}) => {
  const seen = new Set();
  const out = [];

  for (const line of String(text).split(/\r?\n/)) {
    // A spreadsheet row is cells, and the question is one of them: "What's
    // your current role?,,Notes" ends in a comma, not a question mark. Prose
    // is NOT split this way — plenty of sentences contain commas, and
    // cutting them produces fragments that end in "?" by accident.
    for (const cell of tabular ? csvCells(line) : [line]) {
      const part = cell
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")      // "1." "-" "•"
        .replace(/^"+|"+$/g, "")
        .trim();

      if (part.length < 8 || part.length > 300) continue;
      // A question mark, or an imperative that is a question in everything
      // but punctuation. Screening forms are full of the second kind —
      // "Describe a time you disagreed with a manager." — and dropping them
      // would miss most of what a recruiter actually wants answered.
      if (!part.endsWith("?") && !ASKS.test(part)) continue;

      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
  }
  return out;
};

/** Split one CSV line into cells, honouring quotes and doubled quotes. */
const csvCells = (line) => {
  const cells = [];
  let cell = "", quoted = false;

  for (let i = 0; i < line.length; ++i) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; ++i; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(cell); cell = ""; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
};

/** Ask the backend one question. Never throws; a failure becomes sayable. */
const answer = async (question) => {
  try {
    const response = await fetch(`${API_BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: question, history: [] }),
    });
    if (!response.ok) return "(couldn't answer this one — the server was busy)";
    const body = await response.json();
    return (body.answer || []).map(c => c.text).join("").trim()
      || "(couldn't answer this one)";
  } catch {
    return "(couldn't answer this one — no connection)";
  }
};

export { MAX_QUESTIONS, DESKTOP, READERS, extensionOf, questionsIn, csvCells, answer };

// --------------------------------------------------------------------------
// The drop target, and what happens after
// --------------------------------------------------------------------------

import { writeAnswers, answeredName } from "./file-drop-writers.js?v=7fb10eb9";

const overlay = () => {
  const el = document.createElement("div");
  el.id = "file-drop";
  el.innerHTML = `<div id="file-drop-card">
    <strong id="file-drop-title">Drop your questions here</strong>
    <span id="file-drop-note"></span>
  </div>`;
  document.body.appendChild(el);
  return el;
};

if (window.matchMedia(DESKTOP).matches) {
  const el = overlay();
  const title = el.querySelector("#file-drop-title");
  const note  = el.querySelector("#file-drop-note");
  const say = (t, n) => { title.textContent = t; note.textContent = n || ""; };

  const KNOWN = Object.keys(READERS);
  let depth = 0, busy = false;

  const show = () => document.body.setAttribute("file-over", "");
  const hide = () => { depth = 0; document.body.removeAttribute("file-over"); };

  // dragenter/leave fire for every element the pointer crosses, so a plain
  // toggle flickers the overlay away the moment the cursor passes over a
  // chip. Counting the entries is what makes it stable.
  addEventListener("dragenter", (e) => {
    if (busy || !e.dataTransfer?.types?.includes("Files")) return;
    if (++depth === 1) { say("Drop your questions here", `${KNOWN.join(", ")} · up to ${MAX_QUESTIONS} questions`); show(); }
  });
  addEventListener("dragleave", () => { if (!busy && --depth <= 0) hide(); });
  addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });

  addEventListener("drop", async (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    if (busy) return;

    const file = event.dataTransfer.files[0];
    const ext  = extensionOf(file.name);
    const read = READERS[ext];

    depth = 0;
    show();

    if (!read) {
      say("I can't read that one", `${file.name} — try ${KNOWN.join(", ")}`);
      return setTimeout(hide, 3200);
    }

    busy = true;
    try {
      say("Reading…", file.name);
      const found = questionsIn(await read(file), { tabular: ext === "csv" || ext === "xlsx" });

      if (!found.length) {
        say("No questions in there", "I look for lines that ask something — a question mark, or \u201cdescribe\u2026\u201d, \u201ctell me about\u2026\u201d.");
        return setTimeout(hide, 3600);
      }

      // The cap is about money: every question is a model call, and a file
      // is dropped by whoever found the page. Past it the rest are listed
      // in the answer file as unanswered rather than silently dropped —
      // somebody should be able to see exactly what they did not get.
      const asking = found.slice(0, MAX_QUESTIONS);
      const over   = found.slice(MAX_QUESTIONS);

      const rows = [];
      for (const [i, question] of asking.entries()) {
        say(`Answering ${i + 1} of ${asking.length}…`, question);
        rows.push({ q: question, a: await answer(question) });
      }
      for (const question of over) {
        rows.push({ q: question, a: `(not answered — this file had ${found.length} questions and I answer the first ${MAX_QUESTIONS}. Ask me this one directly.)` });
      }

      say("Writing it back…", file.name);
      const blob = await writeAnswers(ext, rows, { name: file.name, total: found.length });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = answeredName(file.name);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      say(over.length ? `Answered ${asking.length} of ${found.length}` : `Answered ${rows.length}`,
          over.length
            ? `${over.length} over the limit are listed unanswered in the file.`
            : answeredName(file.name));
      setTimeout(hide, over.length ? 5200 : 2600);

    } catch (err) {
      say("That didn't work", err.message.slice(0, 120));
      setTimeout(hide, 4000);
    } finally {
      busy = false;
    }
  });
}
