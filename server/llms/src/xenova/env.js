const path = require("path");

// `@xenova/transformers` is ESM-only. Perform a dynamic import at module
// load time and configure its `env` object. The import is intentionally
// asynchronous — this file starts the import early so downstream code
// that later calls the pipeline will find `env` configured when the
// transformers module finishes initializing.

let ready = (async () => {
	try {
		const mod = await import("@xenova/transformers");
		const { env } = mod;

		// Force a fresh download and bypass potential local cache issues
		env.allowLocalModels = false;
		env.allowRemoteModels = true; // Set to true once to download, then false to lock
		env.useBrowserCache = false;
		env.localModelPath = path.join(__dirname, "../../models");
		env.cacheDir = path.join(__dirname, "../../.model_cache"); // Custom cache dir to avoid system-wide corruption
	} catch (err) {
		// Log and continue — consumers that actually call transformers.js will
		// surface the real error if initialization fails.
		console.warn("llms/xenova/env: failed to configure @xenova/transformers env:", err && err.message ? err.message : err);
	}
})();

module.exports = { ready };