"use strict";

require("dotenv").config();
const Pricing = require("./Pricing");

const apiKey = process.env.NEREUS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

/**
 * @constant
 * @readonly
 * @description
 * Per-model pricing (USD per 1M tokens). Cache write is 1.25x standard input
 * (5-minute TTL); cache read is 0.1x standard input.
 *
 * | Model             | Input  | Cache Write | Cache Read | Output |
 * |-------------------|--------|-------------|------------|--------|
 * | claude-fable-5    | $10.00 | $12.50      | $1.00      | $50.00 |
 * | claude-opus-5     |  $5.00 |  $6.25      | $0.50      | $25.00 |
 * | claude-opus-4-8   |  $5.00 |  $6.25      | $0.50      | $25.00 |
 * | claude-sonnet-5   |  $2.00 |  $2.50      | $0.20      | $10.00 |
 * | claude-sonnet-4-6 |  $3.00 |  $3.75      | $0.30      | $15.00 |
 * | claude-haiku-4-5  |  $1.00 |  $1.25      | $0.10      |  $5.00 |
 *
 * @type {Object.<string, Pricing>}
 */
const PRICING = Object.freeze({
  // ── Current generation ──────────────────────────────────────────────────
  "claude-fable-5":            new Pricing({ input: { standard: 10.00, cacheWrite: 12.50, cacheRead: 1.00 }, output: { standard: 50.00 }, batchDiscount: 0.50 }),
  "claude-opus-5":             new Pricing({ input: { standard:  5.00, cacheWrite:  6.25, cacheRead: 0.50 }, output: { standard: 25.00 }, batchDiscount: 0.50 }),
  "claude-opus-4-8":           new Pricing({ input: { standard:  5.00, cacheWrite:  6.25, cacheRead: 0.50 }, output: { standard: 25.00 }, batchDiscount: 0.50 }),
  "claude-sonnet-5":           new Pricing({ input: { standard:  2.00, cacheWrite:  2.50, cacheRead: 0.20 }, output: { standard: 10.00 }, batchDiscount: 0.50 }),
  "claude-haiku-4-5":          new Pricing({ input: { standard:  1.00, cacheWrite:  1.25, cacheRead: 0.10 }, output: { standard:  5.00 }, batchDiscount: 0.50 }),

  // ── Legacy, still live. Retired models (claude-sonnet-4-20250514,
  //    claude-opus-4-20250514) are intentionally absent — see the
  //    deprecated aliases below.
  "claude-sonnet-4-6":         new Pricing({ input: { standard:  3.00, cacheWrite:  3.75, cacheRead: 0.30 }, output: { standard: 15.00 }, batchDiscount: 0.50 }),
  "claude-haiku-4-5-20251001": new Pricing({ input: { standard:  1.00, cacheWrite:  1.25, cacheRead: 0.10 }, output: { standard:  5.00 }, batchDiscount: 0.50 }),
});

/**
 * @constant
 * @readonly
 * @description
 * Model-AGNOSTIC defaults. Nothing here may be model-specific.
 *
 * This separation is load-bearing. `normalizeConfig` merges caller configs
 * over `DEFAULT_CONFIG`, so any model-specific key living in the base leaks
 * into every other model's request. That is exactly how `temperature: 0.5`
 * from the old Sonnet-4.6-based default reached Claude Sonnet 5 and returned
 * `400 — "temperature is deprecated for this model"`.
 *
 * Keep `model`, `max_tokens`, `temperature`, `thinking`, and `pricing` in the
 * per-model presets below. Only put a key here if it is valid for every model.
 *
 * @type {object}
 */
const BASE = Object.freeze({
  apiKey,
  maxRetries: 5,
  pollInterval: 5000,
});

// ─────────────────────────────────────────────────────────────────────────────
// Current generation
//
// `temperature` was REMOVED on Fable 5 / Opus 5 / Sonnet 5 — sending it is a
// 400, not a warning. These presets deliberately omit it. `Config.js` drops
// null values, so `temperature: null` on the legacy presets below is what
// stops a legacy caller's temperature from surviving a merge onto a current
// model, and vice versa.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claude Fable 5 — most capable. Thinking is always on and the `thinking`
 * parameter must be omitted entirely; any explicit configuration is a 400.
 * Depth is controlled through `output_config.effort` instead.
 */
const FABLE5_CONFIG = Object.freeze({
  ...BASE,
  model: "claude-fable-5",
  max_tokens: 16000,
  pricing: PRICING["claude-fable-5"],
});

/** Claude Opus 5 — thinking is adaptive by default; do not send temperature. */
const OPUS5_CONFIG = Object.freeze({
  ...BASE,
  model: "claude-opus-5",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  pricing: PRICING["claude-opus-5"],
});

/** Claude Opus 4.8 — adaptive must be set explicitly; omitting it means no thinking. */
const OPUS48_CONFIG = Object.freeze({
  ...BASE,
  model: "claude-opus-4-8",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  pricing: PRICING["claude-opus-4-8"],
});

/**
 * Claude Sonnet 5 — best price-to-performance, and the recommended default.
 * Cheaper than the Sonnet 4.6 it replaces ($2/$10 vs $3/$15) and stronger.
 */
const SONNET5_CONFIG = Object.freeze({
  ...BASE,
  model: "claude-sonnet-5",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  pricing: PRICING["claude-sonnet-5"],
});

/**
 * Claude Haiku 4.5 — cheapest tier, for high-throughput classification,
 * extraction, and retrieve-and-paraphrase work.
 *
 * Pre-4.6 model: it accepts `temperature` (verified against the live API) and
 * does NOT accept `thinking: {type:"adaptive"}`. `thinking: null` keeps an
 * adaptive setting from a current-model default leaking in.
 */
const HAIKU45_CONFIG = Object.freeze({
  ...BASE,
  model: "claude-haiku-4-5",
  max_tokens: 16000,
  temperature: 0.3,
  thinking: null,
  pricing: PRICING["claude-haiku-4-5"],
});

// ─────────────────────────────────────────────────────────────────────────────
// Legacy presets — retained for existing callers. Each nulls the keys the
// current-generation default would otherwise contribute.
// ─────────────────────────────────────────────────────────────────────────────

/** Claude Sonnet 4.6 — accepts temperature. Prefer SONNET5_CONFIG for new code. */
const SONNET46_CONFIG = Object.freeze({
  ...BASE,
  model: "claude-sonnet-4-6",
  max_tokens: 16000,
  temperature: 0.5,
  thinking: { type: "disabled" },
  pricing: PRICING["claude-sonnet-4-6"],
});

/**
 * @deprecated Alias for {@link SONNET5_CONFIG}.
 *
 * `claude-sonnet-4-20250514` is RETIRED — the API returns
 * `404 not_found_error` for it (verified against the live API). The name is
 * kept so existing imports keep resolving, but it now points at Sonnet 5.
 *
 * This is not cosmetic: `server/endpoints/knowledgeBase/knowledgeBaseUpload.js`
 * used this preset for its `generate` and `augment` stages, so every
 * augmentation call was 404ing. Augmentation failures are per-section SOFT
 * errors, so the pipeline reported success while writing binaries that had
 * only breadcrumb + body vectors.
 *
 * Update call sites to SONNET5_CONFIG and delete this alias.
 */
const SONNET45_CONFIG = SONNET5_CONFIG;

/**
 * @deprecated Alias for {@link OPUS5_CONFIG}.
 *
 * `claude-opus-4-20250514` is RETIRED (404 from the live API). Opus 5 is also
 * a third of the price: $5/$25 against Opus 4's $15/$75.
 *
 * Update call sites to OPUS5_CONFIG and delete this alias.
 */
const OPUS4_CONFIG = OPUS5_CONFIG;

/**
 * @constant
 * @readonly
 * @description
 * Application default. Points at {@link SONNET5_CONFIG}.
 *
 * The default MUST be a current-generation model, because it is the merge
 * base for every other config. A base carrying `temperature` breaks every
 * current model that merges onto it — the original bug. A base without one
 * is safe in both directions: legacy presets contribute their own
 * temperature, current presets contribute none.
 *
 * All named presets and the shared PRICING table hang off this object as
 * non-enumerable properties, so callers have a single import path.
 */
const DEFAULT_CONFIG = { ...SONNET5_CONFIG };

for (const [name, value] of Object.entries({
  FABLE5_CONFIG, OPUS5_CONFIG, OPUS48_CONFIG, SONNET5_CONFIG, HAIKU45_CONFIG,
  SONNET46_CONFIG, SONNET45_CONFIG, OPUS4_CONFIG,
  BASE, PRICING,
})) {
  Object.defineProperty(DEFAULT_CONFIG, name, { value });
}

/**
 * @ignore
 * Default export with freezing.
 */
module.exports = Object.freeze(Object.defineProperty(DEFAULT_CONFIG, "DEFAULT_CONFIG", {
  value: DEFAULT_CONFIG
}));
