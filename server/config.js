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
  max_tokens: 2048,
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
  max_tokens: 4096,
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
  RETRIEVAL: Object.freeze({ floor: 0.78 }),

  /** Greeting shown when the analyzer sees a bare greeting and nothing else. */
  GREETING: "Hi — I'm William. Ask me about my work, my background, or how I think about building things.",

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
