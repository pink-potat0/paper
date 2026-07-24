// Fetches GET /api/paper-secrets and merges helius + solanaTracker into window.PAPER_SECRETS (Vercel / .env).
// Sets window.__paperSecretsPromise — await this before reading PAPER_SECRETS in inline scripts.
(function () {
  var base =
    typeof window !== "undefined" && window.PAPER_API_BASE
      ? String(window.PAPER_API_BASE).replace(/\/$/, "")
      : "";

  function mergeSecretsJson(json) {
    if (!json || typeof json !== "object") return;
    var patch = {};
    var h = String(json.helius || "").trim();
    var st = String(json.solanaTracker || "").trim();
    if (h) patch.helius = h;
    if (st) patch.solanaTracker = st;
    if (Object.keys(patch).length) {
      window.PAPER_SECRETS = Object.assign(window.PAPER_SECRETS || {}, patch);
    }
  }

  function fetchSecrets() {
    return fetch(base + "/api/paper-secrets", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(function (r) {
        if (!r.ok) return {};
        return r.json();
      })
      .then(mergeSecretsJson);
  }

  // First load + one retry if Solana Tracker still missing (cold start / env race on Vercel).
  window.__paperSecretsPromise = fetchSecrets()
    .then(function () {
      var st = String((window.PAPER_SECRETS && window.PAPER_SECRETS.solanaTracker) || "").trim();
      if (!st) return fetchSecrets();
    })
    .catch(function () {});

  /** Call before search / migrated tab if keys might be stale. */
  window.refreshPaperSecrets = function () {
    return fetchSecrets();
  };
})();
