"use strict";

require("dotenv").config();
const path = require("path");
const Pricing = require("llms/src/claude/Pricing");

const ROOT = __dirname;

// Point the ONNX model cache outside node_modules.
//
// llms resolves its default cache relative to its own package directory,
// which lands in node_modules/llms/.model_cache — a path `npm ci` deletes.
// Without this, every deploy would re-download ~125MB from HuggingFace at
// boot. Set before anything requires llms/src/xenova/env.
process.env.XENOVA_CACHE_DIR ||= path.join(ROOT, ".model_cache");

/**
 * Current first-party Anthropic rates (USD per 1M tokens).
 * The vendored llms/src/claude/config.js still carries the Jan-2025 table;
 * these override it so cost accounting reflects reality.
 */
const PRICING = Object.freeze({
  // Haiku 5.5 is priced by prompt length. These are the rates for prompts of
  // 100,000 tokens or fewer; a longer prompt pays 5x ($0.50 / $0.625 / $0.05
  // / $2.50). Pricing holds one rate card, so a >100K prompt would be logged
  // 5x low — not a concern here, since retrieval caps context at a handful of
  // sections and a full request runs ~4K tokens.
  "claude-haiku-5-5": new Pricing({
    input:  { standard: 0.10, cacheWrite: 0.125, cacheRead: 0.01 },
    output: { standard: 0.50 },
    batchDiscount: 0.50,
  }),
  "claude-sonnet-5-5": new Pricing({
    input:  { standard: 2.00, cacheWrite: 2.50, cacheRead: 0.10 },
    output: { standard: 10.00 },
    batchDiscount: 0.50,
  }),
});

/**
 * Answer-path model. Haiku 5.5 — cheapest tier, and this is a
 * retrieve-and-paraphrase task. Swap to SONNET55 if voice quality doesn't
 * hold up against real questions.
 *
 * Ten times cheaper than the Haiku 4.5 this replaced ($0.10/$0.50 against
 * $1/$5), which takes a query from roughly $0.005 to $0.0005.
 *
 * No `temperature`: Haiku 5.5 rejects it (verified against the live API),
 * unlike Haiku 4.5 which accepted it. `thinking: adaptive` is the inverse —
 * valid here, rejected on 4.5. The two Haikus are not drop-in compatible.
 *
 * Thinking is OFF for cost, not correctness. Adaptive works fine with the
 * JSON output contract — run.js filters to text blocks, so thinking blocks
 * never reach parseResponseJson, and three consecutive runs produced valid
 * JSON. It just costs 20-40% more output tokens ($0.0012 against $0.0010 per
 * query) for a retrieve-and-paraphrase task that does not visibly benefit.
 *
 * Turn it on if answer quality ever needs the headroom; measure first.
 */
const HAIKU55 = Object.freeze({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-haiku-5-5",
  // 4096, not 2048. An answer drawing on several sections plus its follow-up
  // questions ran past 2048 and was cut mid-string, so the JSON would not
  // parse. Output is billed per token used, not per token allowed, so the
  // headroom is free; a truncated answer is not.
  max_tokens: 4096,
  thinking: undefined,
  maxRetries: 3,
  pricing: PRICING["claude-haiku-5-5"],
});

/**
 * Ingest-path model. Augmentation quality compounds across every query, so
 * this stays on a stronger model than the answer path.
 *
 * Sonnet 5.5 rather than Sonnet 5: identical base and output pricing, half
 * the cache-read rate.
 *
 * `temperature: null` is deliberate — Sonnet 5.5 rejects the parameter, and
 * null is dropped by the Config class, so a value inherited from the merge
 * base can never reach the request.
 *
 * Thinking is left on here, unlike the answer path. Ingest runs once per
 * corpus change rather than per visitor, so the extra output tokens are
 * negligible, and augmentation quality compounds across every later query.
 */
const SONNET55 = Object.freeze({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-5-5",
  // 16000, not 4096. Augmentation emits one row per (fact, angle) pair, so a
  // dense section — stories/iscribe_turnaround lists six separate
  // achievements — can need well over 4096 tokens. Past the ceiling the JSON
  // array is cut mid-write and fails to parse, which surfaced as "response is
  // not a valid JSON array" and failed identically on every retry.
  max_tokens: 16000,
  temperature: null,
  thinking: { type: "adaptive" },
  maxRetries: 3,
  pricing: PRICING["claude-sonnet-5-5"],
});

module.exports = Object.freeze({
  ROOT,
  PORT: Number(process.env.PORT) || 3002,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || "*",

  MARKDOWNS: path.join(ROOT, "data/markdowns"),
  DATASET:   path.join(ROOT, "data/vectorized-dataset"),

  ANSWER_PROMPT:  path.join(ROOT, "prompts/answer.ppl"),
  // Domain-specific. The vendored llms copy is written for water-treatment
  // reference docs — it asks for sensory descriptors (colour, texture, smell)
  // and its examples are organisms and chemicals. Against first-person career
  // stories it generates near-useless rows.
  AUGMENT_PROMPT: path.join(ROOT, "prompts/augment-section.ppl"),

  PRICING,
  HAIKU55,
  SONNET55,

  /**
   * Only the feature-extraction model is ever loaded. A bare prewarm()
   * would pull all five defaults — including t5-base and
   * LaMini-Flan-T5-783M — roughly 1.2GB, which OOMs a 1GB box.
   */
  PREWARM: Object.freeze({ features: true }),


  /**
   * Classifier configuration.
   *
   * NLI is disabled deliberately. `isLowConfidence` is computed as
   * `bgeMargin < lowConfidence || maxRawCosine < absoluteLow`, so zeroing both
   * makes the NLI trigger unreachable. Measured effect: steady-state RSS drops
   * from 587MB to 281MB, because nli-deberta-v3-xsmall never lazy-loads.
   *
   * That matters twice over: it's what makes a 512MB instance safe, and the
   * 83MB model would be unshippable to a browser if we port retrieval client-side.
   *
   * With NLI gone, classification rests entirely on anchor cosine — so TECHNICAL
   * and SUPPORT anchors below are load-bearing, not optional. They're exemplar
   * phrasings of what a visitor actually types, not category descriptions.
   */
  CLASSIFIER: Object.freeze({
    thresholds: { lowConfidence: 0, absoluteLow: 0 },
    classes: {
      TECHNICAL: {
        description: "a question about William's work, career, background, or how he thinks",
        anchors: [
          "what did you do at Snap?",
          "tell me about your time at Amazon",
          "what's your background?",
          "what have you worked on?",
          "tell me about a time you failed",
          "how do you handle disagreement with your team?",
          "how do you run a team?",
          "what do you think about technical debt?",
          "tell me about your PhD",
          "what are your strengths and weaknesses?",
          "what would you do in your first 90 days?",
          "have you worked in healthcare?",
          "what's a project you're proud of?",
          "why did you leave your last role?",
          "what are you looking for?",
          "how do you feel about firing people?",
          "what's your favorite book?",
          "how big was your team?",
          "have you raised funding?",
          "what do you think the industry looks like in five years?",

          // Added 2026-10-15. The anchors above were written for a corpus of
          // 28 career-fact documents, and every one of them is a specific,
          // past-tense question about a job. The corpus has since grown to 50
          // and gained whole shapes of content they do not cover: origin
          // stories, convictions, personal background, the book, hobbies.
          //
          // The symptom was severe and silent. "How did you get into AI?" —
          // the literal first header in stories/how_i_ended_up_in_ai.md —
          // classified as CONVERSATIONAL at 0.22, so the segment was dropped
          // BEFORE retrieval ran and the model declined a question the corpus
          // answers at length. No retrieval floor could have rescued it.
          //
          // Casually-phrased questions were scoring worse than formal ones,
          // which is backwards for a page whose visitors are mostly casual.
          // Anchors are embedded at engine build, so adding them costs a
          // restart, not a re-ingest.
          "how did you get into AI?",
          "how did you end up doing this?",
          "where are you from?",
          "how did you end up in the United States?",
          "tell me something interesting about yourself",
          "what's your best story?",
          "what do you do outside of work?",
          "what are your hobbies?",
          "what are your values?",
          "what do you believe about AI?",
          "what keeps you awake at night?",
          "have you written a book?",
          "how old are you?",
          "can you work in Europe?",
          "why should I hire you?",
          "what was your childhood like?",
          "what's the most misunderstood thing about you?",
        ],
      },
      SUPPORT: {
        description: "the visitor wants to contact William, hire him, or book time",
        anchors: [
          "how can I get in touch?",
          "what's your email?",
          "can we set up a call?",
          "how do I book time with you?",
          "I'd like to talk about a role",
          "are you available for consulting?",
          "can I see your resume?",
          "what's your LinkedIn?",
        ],
      },
    },
  }),

  /**
   * Retrieval tuning.
   *
   * `floor` is the cosine cutoff. The library default (ABSOLUTE_FLOOR, 0.3)
   * assumes a topically diverse corpus; every section here is about one
   * person, so scores compress into a narrow band well above 0.3 and the
   * default prunes nothing — every query returned the full 12 rows.
   *
   * Swept against a 19-query labeled set (`npm run tune-floor`), after the
   * segmentation fix in llms v1.4.0:
   *
   *   floor   hit@1   hit@3   rows
   *   0.30     67%     93%    12.0
   *   0.74     60%     93%     5.5
   *   0.78     67%     93%     3.6   <- chosen
   *   0.82     73%     93%     2.1
   *   0.84     60%     73%     1.7
   *
   * These read WORSE than the pre-fix numbers (hit@1 87%, hit@3 100%), and
   * that is worth understanding rather than treating as a regression.
   *
   * Before the fix, multi-sentence headers were not recognised as headers and
   * leaked into the corpus as content, so a document could occupy several of
   * the top slots with header text that matched a question almost verbatim —
   * these headers are written as questions. hit@3 is measured per document,
   * so extra sections from the target document inflated it. The old score was
   * partly measuring "did a header match", not "did we retrieve content worth
   * answering from".
   *
   * Section count fell 125 -> 94 with the fix. Answer quality is unchanged on
   * spot checks: the failure and disagreement queries both still return the
   * right story from a single source.
   *
   * 0.82 scores slightly better but sits one step from a cliff at 0.84. 0.78
   * keeps hit@3 at 93% with margin, for 1.5 more rows of context.
   *
   * Re-run the sweep after any corpus or segmentation change.
   */
  /**
   * Cosine floor for retrieval.
   *
   * 0.70, chosen by running the 50-question executive interview battery
   * through the real engine (`npm run coverage`) rather than by sweeping the
   * golden set. Grounded answers, out of 50:
   *
   *     floor 0.82 -> 14      floor 0.78 -> 21
   *     floor 0.74 -> 31      floor 0.70 -> 40
   *
   * Note this CONTRADICTS `npm run tune-floor`, which recommends 0.82. That
   * sweep is not wrong, it is answering a different question: its golden set
   * is 15 short factual lookups ("what did you do at Snap?"), and a short
   * query against a short section scores high. Real visitors ask long,
   * multi-clause behavioural questions, which score lower against the same
   * sections — so a floor tuned on the golden set silently hides material
   * that is present and relevant.
   *
   * Verified at 0.70, because more recall is only good if it stays honest:
   *   - the answers newly surfaced are genuinely grounded, not stitched —
   *     spot-checked on the questions that flipped from declined to answered
   *   - off-topic still declines cleanly (sourdough, World Cup, "write me a
   *     scraper") with no source attached
   *
   * Lower floors return more rows, so context cost per query rises. At this
   * corpus size that is fractions of a cent and worth it.
   */
  RETRIEVAL: Object.freeze({ floor: 0.70 }),

  /** Greeting shown when the analyzer sees a bare greeting and nothing else. */
  GREETING: "Hi — I'm William. Ask me about my work, my background, or how I think about building things.",

  /**
   * Openers offered when there is nothing to generate follow-ups from.
   *
   * The library's buildSimpleResponse() returns followUpQuestions: [] for
   * every path that skips retrieval — a bare greeting, an off-topic decline,
   * and the fallback. Those are exactly the moments a visitor has least idea
   * what to ask, and until now each one was a dead end.
   *
   * Curated rather than generated, deliberately: there is no retrieved
   * context to generate from, these need to be instant and free, and they are
   * the one place the page gets to choose what it shows off. Each maps to a
   * section that answers it well.
   *
   * STARTER_COUNT are sampled per response so a second visit looks different.
   */
  STARTERS: Object.freeze([
    "How did you get into AI?",
    "What's your background?",
    "Why did you leave big tech?",
    "What are your core values?",
    "What keeps you awake at night?",
    "Tell me about a time a project failed.",
    "What's your best story from grad school?",
    "How would you approach AI adoption at a company?",
    "What's the hardest technical decision you've made?",
    "What are you looking for in a role?",
  ]),
  STARTER_COUNT: 3,

  /**
   * Rate limits. Sized for a personal page: a genuinely curious visitor asks
   * a handful of questions, so 15/hour is generous for humans and hostile to
   * scripts. globalPerDay is the spend bound — at ~$0.01/query it caps the
   * daily API bill near $6 even if every per-IP limit is evaded.
   */
  RATE_LIMITS: Object.freeze({
    perIpPerHour: 15,
    perIpPerDay:  40,
    globalPerDay: 600,
  }),

  /** Shown to the visitor when a limit trips. In William's voice, not HTTP-speak. */
  MESSAGES: Object.freeze({
    hourlyLimit: "That's a lot of questions in one go — give it an hour and ask me more. If you'd rather just talk, book time with me or email brendel.william@gmail.com.",
    dailyLimit:  "You've hit my daily limit for one visitor. Happy to keep going tomorrow, or reach me directly at brendel.william@gmail.com.",
    globalCap:   "I'm getting more questions than usual today and have paused to keep the bill sane. Try tomorrow, or email me at brendel.william@gmail.com.",
  }),

  /** Used when the LLM fails validation after every retry. */
  FALLBACK: "Something went wrong on my end answering that. Try rephrasing, or reach me directly at brendel.william@gmail.com.",
});
