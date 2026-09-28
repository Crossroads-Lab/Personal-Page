"use strict";

require("dotenv").config();
const path = require("path");
const Pricing = require("./llms/src/claude/Pricing");

const ROOT = __dirname;

/**
 * Current first-party Anthropic rates (USD per 1M tokens).
 * The vendored llms/src/claude/config.js still carries the Jan-2025 table;
 * these override it so cost accounting reflects reality.
 */
const PRICING = Object.freeze({
  "claude-haiku-4-5": new Pricing({
    input:  { standard: 1.00, cacheWrite: 1.25, cacheRead: 0.10 },
    output: { standard: 5.00 },
    batchDiscount: 0.50,
  }),
  "claude-sonnet-5": new Pricing({
    input:  { standard: 2.00, cacheWrite: 2.50, cacheRead: 0.20 },
    output: { standard: 10.00 },
    batchDiscount: 0.50,
  }),
});

/**
 * Answer-path model. Haiku 4.5 — cheapest tier, and this is a
 * retrieve-and-paraphrase task. Swap to SONNET5 if voice quality
 * doesn't hold up against real questions.
 *
 * `thinking: null` is deliberate: normalizeConfig deep-merges over the
 * vendored DEFAULT_CONFIG (Sonnet 4.6), which carries
 * `thinking: {type:"disabled"}`. Null keeps that from leaking into a
 * Haiku request.
 */
const HAIKU45 = Object.freeze({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-haiku-4-5",
  max_tokens: 2048,
  temperature: 0.4,
  thinking: null,
  maxRetries: 3,
  pricing: PRICING["claude-haiku-4-5"],
});

/** Ingest-path model. Augmentation quality compounds across every query. */
const SONNET5 = Object.freeze({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-5",
  max_tokens: 4096,
  // Both null deliberately. Config.js:120 drops null keys entirely, which is
  // how we stop the vendored DEFAULT_CONFIG (Sonnet 4.6) from leaking
  // `temperature: 0.5` and `thinking: {type:"disabled"}` into the request.
  // Sonnet 5 rejects `temperature` outright: "deprecated for this model".
  temperature: null,
  thinking: null,
  maxRetries: 3,
  pricing: PRICING["claude-sonnet-5"],
});

module.exports = Object.freeze({
  ROOT,
  PORT: Number(process.env.PORT) || 3002,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || "*",

  MARKDOWNS: path.join(ROOT, "data/markdowns"),
  DATASET:   path.join(ROOT, "data/vectorized-dataset"),

  ANSWER_PROMPT:  path.join(ROOT, "prompts/answer.ppl"),
  AUGMENT_PROMPT: path.join(ROOT, "llms/src/actions/generate/binary/prompts/augment-section.ppl"),

  PRICING,
  HAIKU45,
  SONNET5,

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
