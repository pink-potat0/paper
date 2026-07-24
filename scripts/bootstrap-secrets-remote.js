// After /api/paper-secrets (via bootstrap-secrets-fetch.js), load paper-ai.js.
(function () {
  function loadPaperAi() {
    var s = document.createElement("script");
    s.src = "../scripts/paper-ai.js";
    s.async = false;
    document.body.appendChild(s);
  }
  var p = window.__paperSecretsPromise || Promise.resolve();
  p.finally(loadPaperAi);
})();
