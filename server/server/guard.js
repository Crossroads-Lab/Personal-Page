"use strict";

/**
 * Abuse protection for a public endpoint that fronts a funded API key.
 *
 * Threat model: the endpoint is on a public domain with no auth. CORS is not
 * a control — curl ignores it. With auto-reload enabled on the Anthropic
 * account, an unthrottled endpoint converts directly into an unbounded bill.
 *
 * Three independent layers, cheapest first:
 *   1. Per-IP sliding windows  — stops one person hammering it.
 *   2. Global daily cap        — bounds total spend regardless of source
 *                                distribution (botnets defeat per-IP limits).
 *   3. Anthropic spend limit   — set in the console, outside this process.
 *                                The only control that survives a bug in here.
 *
 * State is in-memory and per-process: it resets on restart and doesn't shard.
 * That's the right tradeoff for one small instance — a shared store would add
 * a dependency to defend against an attacker who has already been capped by
 * layer 2.
 */

const CONFIG = require("../config");

const HOUR = 3600_000;
const DAY  = 86_400_000;

/** @type {Map<string, number[]>} ip → request timestamps (ms), ascending. */
const hits = new Map();

let globalDayCount = 0;
let globalDayStart = Date.now();

/** Drop timestamps outside the retention window; delete emptied entries. */
const prune = (now) => {
  for (const [ip, times] of hits) {
    const kept = times.filter(t => now - t < DAY);
    kept.length ? hits.set(ip, kept) : hits.delete(ip);
  }
};

// Unbounded Map growth is a real OOM vector on a 1GB box — an attacker
// cycling source IPs would otherwise add an entry per address forever.
// unref() so this timer never holds the process open.
setInterval(() => prune(Date.now()), HOUR).unref();

/**
 * @returns {{ok: true} | {ok: false, status: number, message: string, retryAfter: number}}
 */
const check = (ip) => {
  const now = Date.now();
  const { perIpPerHour, perIpPerDay, globalPerDay } = CONFIG.RATE_LIMITS;

  // Roll the global window.
  if (now - globalDayStart >= DAY) {
    globalDayCount = 0;
    globalDayStart = now;
  }

  if (globalDayCount >= globalPerDay) {
    return {
      ok: false,
      status: 503,
      message: CONFIG.MESSAGES.globalCap,
      retryAfter: Math.ceil((globalDayStart + DAY - now) / 1000),
    };
  }

  const times = (hits.get(ip) || []).filter(t => now - t < DAY);

  if (times.length >= perIpPerDay) {
    return {
      ok: false,
      status: 429,
      message: CONFIG.MESSAGES.dailyLimit,
      retryAfter: Math.ceil((times[0] + DAY - now) / 1000),
    };
  }

  const lastHour = times.filter(t => now - t < HOUR);
  if (lastHour.length >= perIpPerHour) {
    return {
      ok: false,
      status: 429,
      message: CONFIG.MESSAGES.hourlyLimit,
      retryAfter: Math.ceil((lastHour[0] + HOUR - now) / 1000),
    };
  }

  // Commit only on an allowed request, so rejected ones don't deepen the hole.
  times.push(now);
  hits.set(ip, times);
  globalDayCount++;
  return { ok: true };
};

/** Diagnostics for /health. Never expose per-IP data. */
const stats = () => ({
  trackedIps: hits.size,
  globalToday: globalDayCount,
  globalCap: CONFIG.RATE_LIMITS.globalPerDay,
});

module.exports = Object.freeze({ check, stats, _prune: prune, _hits: hits });
