"use strict"

// --------------------------------------------------------------------------
// The answered file, in the format it arrived as
//
// Same format in, same format out: somebody who sends a .docx questionnaire
// wants a .docx back, not a text file they have to reformat. Each writer
// loads only when that format is the one being produced.
//
// Every writer emits the same thing — question, then answer, in order —
// because the point is that the document reads as the original with the
// blanks filled in, not as a transcript of a chat.
// --------------------------------------------------------------------------

/** One place for the header line, so every format says the same thing. */
const heading = (name, answered, total) =>
  `Answers from william-brendel.com — ${name}` +
  (answered < total ? ` (${answered} of ${total} questions)` : "");

/** CSV needs every field quoted: answers contain commas, quotes and newlines. */
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;

/**
 * @param {string} format - the extension the file arrived as.
 * @param {{q: string, a: string}[]} rows
 * @param {{name: string, total: number}} about
 * @returns {Promise<Blob>}
 */
export const writeAnswers = async (format, rows, about) => {
  const title = heading(about.name, rows.length, about.total);

  if (format === "csv") {
    const body = [
      [csvCell("Question"), csvCell("Answer")].join(","),
      ...rows.map(r => [csvCell(r.q), csvCell(r.a)].join(",")),
    ].join("\r\n");
    return new Blob([`${csvCell(title)}\r\n\r\n${body}\r\n`], { type: "text/csv" });
  }

  if (format === "xlsx") {
    const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
    const sheet = XLSX.utils.aoa_to_sheet([
      [title], [], ["Question", "Answer"],
      ...rows.map(r => [r.q, r.a]),
    ]);
    // Without widths every answer is one unreadable column of overflow.
    sheet["!cols"] = [{ wch: 52 }, { wch: 110 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Answers");
    return new Blob([XLSX.write(book, { bookType: "xlsx", type: "array" })], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  if (format === "docx") {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } =
      await import("https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm");
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }),
          ...rows.flatMap(r => [
            new Paragraph({ children: [new TextRun({ text: r.q, bold: true })], spacing: { before: 280 } }),
            // One paragraph per paragraph: an answer with blank lines in it
            // becomes several, or Word renders it as one wall.
            ...r.a.split(/\n{2,}/).map(part =>
              new Paragraph({ children: [new TextRun(part.replace(/\n/g, " "))], spacing: { before: 90 } })),
          ]),
        ],
      }],
    });
    return Packer.toBlob(doc);
  }

  if (format === "pdf") {
    const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
    const pdf = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 54, width = pdf.internal.pageSize.getWidth() - margin * 2;
    const bottom = pdf.internal.pageSize.getHeight() - margin;
    let y = margin;

    const put = (text, { bold = false, size = 10.5, gap = 4 } = {}) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
      for (const line of pdf.splitTextToSize(text, width)) {
        // Break the page before the line, not after: a line drawn past the
        // bottom margin is simply not on the page.
        if (y > bottom) { pdf.addPage(); y = margin; }
        pdf.text(line, margin, y);
        y += size * 1.35;
      }
      y += gap;
    };

    put(title, { bold: true, size: 13, gap: 14 });
    for (const row of rows) {
      put(row.q, { bold: true, gap: 3 });
      put(row.a.replace(/\n{2,}/g, "\n").replace(/\n/g, " "), { gap: 14 });
    }
    return pdf.output("blob");
  }

  // txt, md, and anything that got this far.
  const body = rows.map(r => `${r.q}\n\n${r.a}`).join("\n\n\n");
  return new Blob([`${title}\n\n\n${body}\n`], { type: "text/plain" });
};

/** Name the answered copy after the original, so the pair is obvious. */
export const answeredName = (name) => {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)} — answered${name.slice(dot)}`
    : `${name} — answered`;
};
