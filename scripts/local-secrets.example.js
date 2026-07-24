// Copy to local-secrets.js (gitignored). In pages that need keys, add before bootstrap-secrets.js:
// <script src="../scripts/local-secrets.js"></script>
window.PAPER_SECRETS = Object.assign({}, window.PAPER_SECRETS || {}, {
  openai: "",
  helius: "",
  solanaTracker: "",
});
