"use strict";

/**
 * Coverage audit against a standard executive interview battery.
 *
 *   npm run coverage           # ANSWERED / THIN / DECLINED per question
 *   npm run coverage -- --all  # include the answer text
 *
 * This calls the real engine.ask(), the same path the HTTP server uses, and
 * costs roughly $0.0012 per question — about six cents for the full battery.
 *
 * An earlier version of this script reimplemented retrieval (search +
 * unionHits + resolve) to stay free. It was wrong twice over: `hit.score` is
 * rewritten by the rerank stage, so comparing it to the cosine floor is
 * meaningless, and the simplified path under-retrieved relative to the real
 * pipeline — it reported "no material" for questions the server answers well.
 * Approximating the thing under test is not a saving.
 *
 * The signal is whether the answer carries SOURCES. The answer prompt only
 * attaches a source to a chunk grounded in a retrieved section, so:
 *   ANSWERED — grounded in corpus sections
 *   THIN     — answered, but only one grounded chunk behind it
 *   DECLINED — no grounded chunk; the model correctly refused to invent
 */

const CONFIG    = require("../config");
const getEngine = require("./../server/engine");

const BATTERY = [
  ["Leadership & Executive Vision", [
    "Describe a time you set a strategic vision for a team that faced significant resistance. How did you get buy-in?",
    "What is your philosophy on leading through major change or organizational restructuring?",
    "Tell me about the toughest decision you had to make as a leader recently.",
    "How do you balance long-term strategic goals with short-term fire-fighting?",
    "Tell me about a time a major project failed under your watch. How did you handle it?",
    "Describe a time you had to sell an unpopular or high-risk decision to stakeholders or the board.",
    "How do you identify, groom and retain high-potential talent?",
    "Give an example of stepping in to manage an underperforming or demotivated team.",
    "How do you define your leadership style, and how has it evolved?",
    "Tell me about a time you led by example when your team was stretched thin.",
    "How do you measure the health and success of a department or company culture?",
    "Describe realigning a team's priorities after a sudden shift in market conditions.",
  ]],
  ["Behavioral & Problem-Solving", [
    "Tell me about solving a complex problem with very limited data or resources.",
    "Describe making a critical decision under severe time pressure.",
    "Give an example of disagreeing with your manager or executive leadership. How did you push back?",
    "Two key stakeholders had conflicting priorities. How did you broker a compromise?",
    "Describe failing to meet a major deadline or KPI. How did you rectify it?",
    "How do you handle ambiguity when requirements are unclear or shifting?",
    "Tell me about delivering difficult, career-altering feedback to a direct report.",
    "Describe identifying an inefficient process and re-engineering it from scratch.",
    "How do you handle someone who consistently misses expectations despite coaching?",
    "Tell me about influencing someone without having direct authority over them.",
    "Describe adapting your communication style for a difficult audience.",
    "Give an example of a calculated risk that did not pay off. What was the takeaway?",
  ]],
  ["HR, Culture & People", [
    "What is your approach to resolving conflict between two valuable team members?",
    "Describe your best and worst hiring decisions.",
    "How do you handle burnout, for yourself or across your team?",
    "What do you do to foster psychological safety and open feedback?",
    "Tell me about managing a layoff or restructuring. How did you handle the human element?",
    "How do you promote diversity, equity and inclusion in hiring and project assignment?",
    "Describe addressing an ethical violation or breach of company policy.",
    "How do you reward and recognise high performers beyond compensation?",
    "What do you look for when evaluating a candidate's cultural add?",
    "How do you handle a high performer who is toxic to peers?",
    "Tell me about mediating a dispute between HR and a business unit leader.",
    "How do you manage remote or hybrid team engagement and accountability?",
    "What is your strategy for onboarding senior or executive hires?",
    "How do you handle employees who resist company-wide policy or cultural change?",
  ]],
  ["Executive Presence & Self-Awareness", [
    "Why shouldn't I hire you?",
    "How would your direct reports describe your management style? How would your toughest critic?",
    "What is your greatest professional weakness and how do you compensate for it?",
    "It's noon one year from now. What are you doing?",
    "What keeps you awake at night when running an organization?",
    "How do you disconnect and recharge in a high-stress executive role?",
    "What is the most misunderstood aspect of your leadership style?",
    "If you joined us and could change one thing in your first 90 days, what would it be?",
    "How do you evaluate your own performance when the metrics are subjective?",
    "Tell me about a time someone challenged your core expertise. How did you respond?",
    "What belief about management have you completely changed your mind about?",
    "Why are you leaving your current position, and what legacy do you want to leave?",
  ]],
];

const main = async () => {
  const showAll = process.argv.includes("--all");
  const { ask } = await getEngine();

  let answered = 0, thin = 0, declined = 0;
  const gaps = [];

  for (const [group, questions] of BATTERY) {
    console.log(`\n── ${group} ${"─".repeat(Math.max(0, 56 - group.length))}`);
    for (const q of questions) {
      const r = await ask(q);
      const chunks = r.answer || [];
      const sources = [...new Set(chunks.filter(c => c.source).map(c => c.source.documentId))];

      const status = sources.length === 0 ? "DECLINED"
                   : chunks.filter(c => c.source).length === 1 ? "THIN"
                   : "ANSWERED";

      if (status === "ANSWERED") answered++;
      else if (status === "THIN") thin++;
      else { declined++; gaps.push(q); }

      const tag = status === "ANSWERED" ? "  ok  " : status === "THIN" ? " thin " : " MISS ";
      console.log(`${tag} ${q.slice(0, 68)}`);
      if (sources.length) console.log(`        ${sources.join(", ")}`);
      if (showAll) console.log(`        "${chunks.map(c => c.text).join(" ").slice(0, 160)}"`);
    }
  }

  const total = answered + thin + declined;
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  answered ${answered}/${total}    thin ${thin}    declined ${declined}`);
  console.log(`${"─".repeat(64)}`);
  if (gaps.length) {
    console.log(`\n  Questions with no corpus material — these need you, not me:\n`);
    gaps.forEach((q, i) => console.log(`   ${String(i + 1).padStart(2)}. ${q}`));
  }
  console.log();
};

main().catch(e => { console.error(e); process.exit(1); });
